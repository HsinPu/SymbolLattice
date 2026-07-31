# Changelog

All notable changes to SymbolLattice are documented in this file.

## [Unreleased]

No unreleased changes.

## [0.93.0] - 2026-07-31

### Added

- Shell/Bash source discovery now recognizes case-insensitive `.sh` and `.bash` extensions and exposes the additive `shell` language through existing persisted source-search, CLI, and MCP language-validation contracts. The new dependency-free lexical extractor retains a file symbol plus complete direct top-level POSIX `name() { ... }` and Bash `function name { ... }` function symbols.
- Each accepted Shell function has its complete source range and an exact file-to-function `contains` edge carrying `language.shell.function.direct-top-level` evidence. Strings, comments, escapes, and `${...}` parameter expansions are masked before brace matching; functions nested in direct control-flow/group shapes, incomplete source, quoted/commented lookalikes, and here-documents do not become declarations. Unit, discovery, and service integration coverage prove both declaration forms, source ranges, persistence, source search, nested/incomplete rejection, and here-document safety. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.93.0.md`.

### Compatibility

- The artifact extractor advances to `multi-language-ast-v82`; the project resolver remains `project-resolver-v24` because the initial Shell slice emits only file-local declaration and containment facts. A pre-v0.93 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Shell-capable facts.
- No SQLite schema migration or query command is required. This is an additive artifact-language capability within existing file, function-symbol, exact-containment-edge, source-search, CLI, MCP, retained-generation, and incremental-index contracts; existing generations remain readable.

### Deliberate limits

- This is not a Shell parser, shellcheck integration, or execution model. It excludes extensionless shebang scripts, zsh/fish dialects, command calls, `source`/dot imports, aliases, nested/group/control-flow function declarations, `eval`, here-documents, command substitution analysis, pipelines, redirections, arrays, traps, module/package resolution, environment variables, linting, and runtime behavior.
- The inspected local CodeGraph baseline does not list Shell/Bash among its runtime `LANGUAGES` entries. SymbolLattice v0.93 independently adds a deliberately narrow, source-range-preserving Shell declaration slice; it does not copy CodeGraph source or claim full shell-language coverage.

## [0.92.0] - 2026-07-31

### Added

- The first-party framework registry now includes `spring-boot-properties`. A direct Java field inside a direct class can retain a raw property-reference fact only when an exact `org.springframework.beans.factory.annotation.Value` import or fully-qualified annotation proves one static `${key}` or `${key:default}` literal. The source range is the annotation itself; property values are never retained.
- Project resolution now considers only parser-proven keys in conventional `application.properties`, `application-*.properties`, `bootstrap.properties`, and `bootstrap-*.properties` files. A unique literal key becomes an exact class-to-key `references` edge with `framework.spring-boot.properties.direct-value.literal-key.exact-key` evidence. Missing and duplicate keys remain explicit unresolved `references` edges with rule-specific evidence, candidate IDs, and applicable configuration paths; no profile or precedence guess is made.
- `references` is now a first-class static traversal relation for direct callers, callees, bounded evidence paths, and reverse impact paths. SQLite raw-artifact serialization persists the additive Spring Boot property facts so an explicit sync can safely reproject them. Unit, graph, and service integration coverage prove field/import boundaries, source ranges, persistence, exact queryability, ambiguous/missing evidence, value non-retention, and traversal. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.92.0.md`.

### Compatibility

- The artifact extractor advances to `multi-language-ast-v81` and the project resolver to `project-resolver-v24` because the release adds persisted cross-file Spring Boot property-reference projection. A pre-v0.92 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes complete facts and graph evidence.
- No SQLite schema migration or query command is required. The additive raw-fact payload and `references` edge use existing artifact-fact, graph, source-search, CLI, MCP, retained-generation, and incremental-index contracts; existing generations remain readable.

### Deliberate limits

- This is not a general Spring configuration model. It excludes YAML, Kotlin, `@ConfigurationProperties`, method or parameter annotations, aliases/wildcard imports, named or dynamic arguments, string concatenation/escaping, nested placeholders, SpEL, relaxed binding, active-profile selection, precedence/default merging, imports, environment overrides, validation, values, and runtime behavior.
- The inspected local CodeGraph baseline has broader Spring configuration detection, including YAML/property configuration candidates, `@Value`, `@ConfigurationProperties`, relaxed binding, and profile heuristics. SymbolLattice v0.92 independently adds a narrower persistence-safe proof that resolves only one unique conventional properties key and makes uncertainty explicit; it does not copy CodeGraph source or claim parity.

## [0.91.0] - 2026-07-31

### Added

- Java `.properties` source discovery now recognizes every case-insensitive `.properties` extension and exposes the additive `properties` language through the existing persisted source-search, CLI, and MCP language-validation contracts. The new dependency-free parser retains a file symbol plus source-ranged `variable` symbols for literal non-empty keys across all properties filenames.
- The parser accepts comments, `=`, `:`, whitespace-separated, and no-value entries; it decodes source-proven escaped separators, whitespace, and `\\uXXXX` key characters. Value-continuation lines are consumed so they cannot become false declarations. Key ranges, symbols, and edge evidence never include property values, and each exact file-to-key containment edge carries `syntax.properties.literal-key` evidence. Unit, discovery, and service integration coverage prove escaped-key identities, duplicate ordinals, continuation safety, value omission from artifact facts, malformed/dangling/continued-key exclusion, persisted provenance, and source-search filtering. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.91.0.md`.

### Compatibility

- The artifact extractor advances to `multi-language-ast-v80`; the project resolver remains `project-resolver-v23` because properties facts are direct file-local declarations with no cross-file configuration binding. A pre-v0.91 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes properties-capable facts.
- No SQLite schema migration or query command is required. This is an additive artifact-language capability within existing file, variable-symbol, exact-containment-edge, source-search, CLI, MCP, and incremental-index contracts; existing generations remain readable.

### Deliberate limits

- This is not a complete Java `Properties` runtime model. It excludes continued keys, malformed escapes, control-character keys, profile/config precedence, placeholders, interpolation, default merging, encoding/runtime loading behavior, value semantics, Spring `@Value` / `@ConfigurationProperties`, framework detection, cross-file resolution, schema validation, and runtime behavior.
- The inspected local CodeGraph baseline tracks generic `.properties` files at file level and has a Spring-specific `application` / `bootstrap` key and binding pass. SymbolLattice v0.91 independently adds generic, parser-backed key facts across all `.properties` names with source key ranges and explicit containment evidence; it does not copy CodeGraph source or claim Spring parity.

## [0.90.0] - 2026-07-31

### Added

- The XML extractor now has a bounded MyBatis 3 mapper pass. A parser-valid `<mapper namespace="Java.FQN">` accepts direct `select`, `insert`, `update`, `delete`, and `sql` child elements with simple identifier `id` values as source-ranged `method` symbols qualified as `Java.FQN::id`. The standard MyBatis Mapper 3.0 DTD declaration is the only DTD exception; it is checked as literal syntax and is never fetched, expanded, or evaluated.
- A self-closing literal same-mapper `<include refid="id"/>` inside one accepted statement becomes an exact `calls` edge only when one same-file `sql` fragment proves the target. Missing or ambiguous fragments retain an explicit unresolved `calls` edge with `framework.mybatis.mapper.literal-include.*` evidence. Unit and service integration coverage prove standard-DTD acceptance, statement containment, nested literal includes, exact source ranges, source search, invalid namespace/id rejection, unsupported DTD rejection, and persisted graph queries. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.90.0.md`.

### Compatibility

- The artifact extractor advances to `multi-language-ast-v79`; the project resolver remains `project-resolver-v23` because MyBatis statement and include facts resolve only inside one XML source file. A pre-v0.90 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes MyBatis-capable facts.
- No SQLite schema migration or query command is required. This is an additive XML-framework capability within existing file, method-symbol, exact/unresolved call-edge, source-search, CLI, MCP, and incremental-index contracts; existing generations remain readable.

### Deliberate limits

- This is not a general MyBatis, iBatis, SQL, XML DOM, DTD/entity, schema, or Java project model. It excludes iBatis `<sqlMap>`, result maps, cache/configuration, dynamic SQL tags, statement attribute and SQL-text semantics, dotted/cross-mapper includes, generated interfaces, cross-file Java mapper resolution, DTD/entity processing, validation, and runtime behavior.
- The inspected local CodeGraph baseline is broader: it supports MyBatis 3 plus iBatis 2 statement forms, richer statement metadata, and mapper include references. SymbolLattice v0.90 independently adds a deliberately narrower parser-backed MyBatis 3 subset with complete source ranges and explicit exact/unresolved same-file evidence; it does not copy CodeGraph source or claim parity.

## [0.89.0] - 2026-07-31

### Added

- XML source discovery now recognizes `.xml` files and exposes the new `xml` language through persisted source search plus the existing CLI and MCP language validation contracts. The new `saxes@6.0.0` event-parser-backed extractor accepts one well-formed, DTD-free document and retains only the root element plus its direct child elements as source-ranged `resource` symbols.
- Each retained XML resource has exact `contains` evidence: `syntax.xml.root-element` from file to root and `syntax.xml.direct-child-element` from root to direct child. Unit, discovery, and service integration coverage prove complete element ranges, duplicate-safe child paths, nested-descendant exclusion, persisted source search, and malformed/multi-root/DTD fail-closed behavior. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.89.0.md`.

### Compatibility

- The artifact extractor advances to `multi-language-ast-v78`; the project resolver remains `project-resolver-v23` because XML resource facts are file-local. A pre-v0.89 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes XML-capable facts.
- No SQLite schema migration or query command is required. This is an additive artifact-language capability within the existing file, resource-symbol, containment-edge, source-search, CLI, MCP, and incremental-index contracts; existing generations remain readable.

### Deliberate limits

- This is not a general XML DOM, namespace, XPath/XQuery, DTD/entity/schema, XInclude, import, code-generation, configuration, or runtime model. It excludes attributes and values, text/CDATA/comments/processing instructions, namespace resolution, XML below the direct-child level, MyBatis/Spring-specific semantics, cross-file resolution, validation, and runtime behavior.
- The inspected local CodeGraph baseline tracks generic XML at file level and has a narrower MyBatis-specific XML path. SymbolLattice v0.89 independently adds parser-backed generic root/direct-child source ranges and containment evidence, but does not claim MyBatis parity or copy CodeGraph source.

## [0.88.0] - 2026-07-31

### Added

- The executable first-party framework capability registry and route-framework provenance now include `drupal`. Parser-backed YAML extraction recognizes only valid single-document `*.routing.yml` / `*.routing.yaml` files whose direct route mapping proves a slash-prefixed literal `path`, a direct `defaults._controller` in `\Drupal\…\Class::method` form, and either a literal uppercase pipe-separated `requirements._method` set or no method requirement (`ALL`).
- Each accepted Drupal route becomes a first-class `route` symbol with exact `framework.drupal.routing-yaml.literal-controller.route-node` containment evidence and an explicit unresolved `routes` edge retaining the controller spelling. Unit and service integration coverage prove `.yml` / `.yaml` discovery, method expansion/filtering, persisted source search and route queries, and rejection of service/Form controller syntax, unsupported methods, malformed requirements, anchors, and multi-document input. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.88.0.md`.

### Compatibility

- The artifact extractor advances to `multi-language-ast-v77`; the project resolver remains `project-resolver-v23` because the Drupal route node and its explicitly unresolved controller evidence are file-local. A pre-v0.88 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Drupal-route-capable facts.
- No SQLite schema migration or query command is required. This is an additive YAML-framework capability within the existing file, route-symbol, route-edge, source-search, CLI, MCP, and incremental-index contracts; existing generations remain readable.

### Deliberate limits

- This is not a general Drupal/Symfony route model. It excludes service controller syntax, `_form`, `_entity_form`, entity views/lists, hooks, aliases, dynamic route providers, route options/access semantics, aliases/anchors/tags/merge semantics, block/multiline scalars, duplicate or malformed requirements, PHP namespace/autoload/controller resolution, compilation, and runtime routing behavior.
- The inspected local CodeGraph baseline has a broader Drupal resolver that detects Drupal projects and recognizes controller, form, and hook relationships. SymbolLattice v0.88 independently adds parser-backed source ranges and explicit unresolved controller evidence for a deliberately narrower static YAML controller subset; it does not copy CodeGraph source or claim full Drupal parity.

## [0.87.0] - 2026-07-31

### Added

- YAML source discovery now recognizes `.yaml` and `.yml` files and exposes the new `yaml` language through persisted source search plus the existing CLI and MCP language validation contracts. The new `yaml@2.9.0` parser-backed extractor accepts one parser-valid document with a top-level mapping and produces variables only for source-ranged, untagged, unanchored top-level scalar key/value pairs that remain on one line.
- Each retained YAML key has an exact `contains` edge with `syntax.yaml.top-level-scalar-mapping` evidence. Unit, discovery, and service integration coverage prove `.yaml` / `.yml` recognition, quoted/scalar values, nested-map/sequence exclusion, anchored/alias/tagged exclusion, malformed and multi-document fail-closed behavior, persisted provenance, and YAML source-search filtering. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.87.0.md`.

### Compatibility

- The artifact extractor advances to `multi-language-ast-v76`; the project resolver remains `project-resolver-v23` because YAML facts are direct, file-local declarations with no configuration-reference resolution. A pre-v0.87 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes YAML-capable facts.
- No SQLite schema migration or query command is required. This is an additive artifact-language capability within the existing file, variable-symbol, containment-edge, source-search, CLI, MCP, and incremental-index contracts; existing generations remain readable.

### Deliberate limits

- This is not a general YAML configuration model. It excludes nested mappings/sequences, empty or null values, aliases, anchors, explicit tags, block scalars, complex keys, multi-document streams, merge/configuration semantics, schemas, imports, calls, routes, framework recognition, cross-file resolution, deployment behavior, and runtime values.
- The inspected local CodeGraph baseline tracks YAML files generally at file level and has a Spring-specific handwritten leaf-key pass for `application` / `bootstrap` YAML configuration. SymbolLattice v0.87 independently adds parser-backed, source-ranged declaration facts for a deliberately narrow top-level subset across all YAML filenames, rather than claiming broad configuration semantics or copying CodeGraph source.

## [0.86.0] - 2026-07-31

### Added

- Go Echo route extraction now recognizes direct non-dot/non-blank imports of `github.com/labstack/echo/v4` and `github.com/labstack/echo/v5`, using the default `echo` name or a direct alias. A route requires a same-function short-variable `app := echo.New()` binding, a literal slash-prefixed path, one unshadowed named package-level handler, and either a direct App method or a proven nested same-function literal `Group` prefix. Direct `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`, and `Any` registrations become exact route evidence; `Any` is represented as `ALL`.
- The executable first-party framework capability registry, `RouteFramework` provenance union, persisted route query, and Go route evidence now include `echo`. Unit and service integration coverage prove v5 aliases, v4 default imports, nested group composition, exact rule IDs, `ALL` method filtering, and rejection of dynamic paths, alias shadows, inline/middleware handlers, `Match`, `var` constructors, mutable receivers, and unsupported group forms. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.86.0.md`.

### Compatibility

- The artifact extractor advances to `multi-language-ast-v75`; the project resolver remains `project-resolver-v23` because the Echo App, Group, path, and handler proof remains file-local. A pre-v0.86 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Echo-capable facts.
- No SQLite schema migration or query command is required. This is an additive Go framework capability within the existing file, symbol, route-edge, source-search, CLI, MCP, and incremental-index contracts; existing generations remain readable.

### Deliberate limits

- The Echo slice is not a general Echo program model. It excludes middleware, `Match`, `File` / static helpers, path parameters/wildcard semantics, handlers other than one named package-level function, `var`/factory/wrapper/chained/mutable receiver flow, cross-file packages, generic Go analysis, compilation, and runtime routing behavior.
- The inspected local CodeGraph baseline labels its broad generic Go receiver-method resolver as covering Echo, but does not require Echo v4/v5 imports, `echo.New()` construction, literal Group-prefix composition, or unique same-file handler identity. SymbolLattice v0.86 is deliberately narrower in source coverage and stronger in auditability; it is independently implemented and does not copy CodeGraph source.

## [0.85.0] - 2026-07-31

### Added

- Zig source discovery now recognizes `.zig` files and exposes the new `zig` language through persisted source search plus the existing CLI and MCP language validation contracts. A syntactically balanced Zig file produces direct top-level named `struct`, `enum`, `union`, and `opaque` containers as class symbols plus direct named `fn` declarations as function symbols; `pub` and `export fn` visibility is retained.
- The first Zig extractor preserves source offsets while masking line comments, quoted literals, and line-oriented multiline string literal lines. It emits exact `syntax.zig.top-level-container` or `syntax.zig.top-level-function` containment evidence and rejects unbalanced delimiters, unterminated quoted literals, anonymous/computed containers, nested container or test-scope declarations, imports, calls, and runtime behavior. Unit, discovery, and service integration coverage prove the retained scope, source-search persistence, and rejection boundaries. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.85.0.md`.

### Compatibility

- The artifact extractor advances to `multi-language-ast-v74`; the project resolver remains `project-resolver-v23` because the initial Zig facts are file-local. A pre-v0.85 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Zig-capable facts.
- No SQLite schema migration or query command is required. This is an additive artifact-language capability within the existing file, symbol, containment-edge, source-search, CLI, MCP, and incremental-index contracts; existing generations remain readable.

### Deliberate limits

- This is not a Zig parser, compiler, build-system, package/module resolver, or runtime model. It excludes imports, calls, variables, `test` blocks, nested methods, anonymous/comptime/generated containers, aliases, `usingnamespace`, cross-file resolution, type inference, build configuration, compilation, and runtime behavior.
- The inspected local CodeGraph baseline has no `zig` member in its current `LANGUAGES` registry. SymbolLattice v0.85 therefore expands language breadth beyond that checked baseline, while retaining a deliberately narrower, independently implemented source-proven declaration contract.

## [0.84.0] - 2026-07-31

### Added

- Go Fiber route extraction now recognizes direct non-dot/non-blank imports of `github.com/gofiber/fiber/v2` and `github.com/gofiber/fiber/v3`, using the default `fiber` name or a direct alias. A route requires a same-function short-variable `app := fiber.New()` binding, a literal slash-prefixed path, one unshadowed named package-level handler, and either a direct App method or a proven nested same-function literal `Group` prefix. Direct `Get`, `Post`, `Put`, `Patch`, `Delete`, `Head`, `Options`, `Trace`, `Connect`, and `All` registrations become exact route evidence; `All` is represented as `ALL`.
- The executable first-party framework capability registry, `RouteFramework` provenance union, persisted route query, and Go route evidence now include `fiber`. Unit and service integration coverage prove v3 aliases, v2 default imports, nested group composition, exact rule IDs, method filtering, and rejection of dynamic paths, alias shadows, inline/middleware handlers, configured/factory/`var` constructors, mutable receivers, and unsupported group forms. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.84.0.md`.

### Compatibility

- The artifact extractor advances to `multi-language-ast-v73`; the project resolver remains `project-resolver-v23` because the Fiber App, Group, path, and handler proof remains file-local. A pre-v0.84 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Fiber-capable facts.
- No SQLite schema migration or query command is required. This is an additive Go framework capability within the existing file, symbol, route-edge, source-search, CLI, MCP, and incremental-index contracts; existing generations remain readable.

### Deliberate limits

- The Fiber slice is not a general Fiber program model. It excludes constructor configuration, `Use`, `Route`, `RouteChain`, mounted sub-apps, group middleware, path parameters/constraints semantics, automatic `HEAD`, handlers other than one named package-level function, `var`/factory/wrapper/chained/mutable receiver flow, cross-file packages, generic Go analysis, compilation, and runtime routing behavior.
- The inspected local CodeGraph baseline recognizes Go framework-looking method calls including Fiber through a broad receiver pattern. SymbolLattice v0.84 is narrower in source coverage but adds explicit v2/v3 import and App-construction proof, group-prefix provenance, exact unique same-file handler identity, and fail-closed rebinding behavior; it is independently implemented and does not copy CodeGraph source.

## [0.83.0] - 2026-07-31

### Added

- COBOL source discovery now recognizes `.cbl`, `.cob`, `.cobol`, and `.cpy` paths and exposes the new `cobol` language through persisted source search plus the existing CLI and MCP language validation contracts. A source file produces a program module only after exactly one direct `IDENTIFICATION DIVISION.`, `PROGRAM-ID. name.`, and `PROCEDURE DIVISION.` sequence; direct free-format or fixed-format Area-A Procedure Division paragraph labels become contained function symbols.
- The first COBOL extractor masks fixed-format comment lines, `*>` comments, and complete quoted literals before scanning, preserves offsets for evidence, and fails closed for unterminated literals, duplicate programs, missing divisions, and `.cpy` copybook input. Unit and service integration coverage verifies all supported extensions, fixed/free paragraph containment, exact evidence, persisted provenance, source search, and rejection boundaries. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.83.0.md`.

### Compatibility

- The artifact extractor advances to `multi-language-ast-v72`; the project resolver remains `project-resolver-v23` because the initial COBOL facts are file-local. A pre-v0.83 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes COBOL-capable facts.
- No SQLite schema migration or query command is required. This is an additive artifact-language capability within the existing file, symbol, containment-edge, source-search, CLI, MCP, and incremental-index contracts; existing generations remain readable.

### Deliberate limits

- This is not a COBOL grammar, compiler, copybook resolver, or runtime model. Data/section/declarative declarations, `PERFORM` / `CALL` relations, nested programs, `PROCEDURE DIVISION USING`, compiler directives/source formats, dialect semantics, project resolution, CICS/SQL/JCL, compilation, and runtime behavior remain outside scope.
- The inspected local CodeGraph baseline has a COBOL Tree-sitter grammar and broader general syntax extraction. SymbolLattice v0.83 is intentionally narrower, but adds persistent language-filtered source search and explicit rule IDs for the source-proven program/paragraph subset; it is independently implemented and does not copy CodeGraph source.

## [0.82.0] - 2026-07-31

### Added

- Pascal Horse route extraction now accepts a direct main-program `THorse.Head('/literal', PriorLocalRoutine)` registration in addition to Get, Post, Put, Patch, and Delete. The accepted form still requires exactly one standalone `uses Horse;` proof, exactly one direct program main block, a one-line slash-prefixed literal path, and a unique prior same-file complete routine handler. Unit and service integration coverage verifies exact `HEAD` route/handler evidence and method filtering while preserving `Options` rejection. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.82.0.md`.

### Compatibility

- The artifact extractor advances to `multi-language-ast-v71`; the project resolver remains `project-resolver-v23` because every accepted Horse route and handler proof remains file-local. A pre-v0.82 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes the expanded Horse facts.
- No SQLite schema migration or query command is required. This is an additive framework capability expansion within the existing Pascal artifact, graph, route query, source-search, CLI, MCP, incremental-index, and evidence contracts; existing generations remain readable.

### Deliberate limits

- `Options` and all other Horse methods remain excluded, as do combined/aliased `uses`, units, callbacks, groups, prefixes, middleware, aliases/wrappers, nested or routine-local registrations, nonliteral paths, late/ambiguous/cross-file handlers, compilation, and runtime behavior.
- The inspected local CodeGraph baseline has broad Pascal syntax and relationship analysis but no dedicated Horse route rule. SymbolLattice v0.82 remains narrower in general Pascal coverage and deliberately deeper for this source-proven Horse `HEAD` registration; the implementation is independent and does not copy CodeGraph source.

## [0.81.0] - 2026-07-31

### Added

- Source discovery now treats a `.h` file as an Objective-C candidate only after its source proves a direct `@interface` or `@protocol` container followed by a direct `@end`. The classifier blanks line/block comments, quoted literals, and preprocessor directives (including CRLF continuation macros) before checking that proof, so ordinary C/C++ headers and declaration-looking text do not enter the graph.
- Proven headers reuse the existing conservative Objective-C extractor: direct ordinary interfaces and protocols contribute the same local class/interface and one-line declaration-method evidence as `.m` / `.mm`; the full service path persists them as `objc` and exposes them to the existing language-filtered source search. Unit and integration coverage verifies positive interface/protocol headers, plain C rejection, comment/string/macro/incomplete rejection, persisted provenance, exact symbols, and source search. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.81.0.md`.

### Compatibility

- The artifact extractor advances to `multi-language-ast-v70`; the project resolver remains `project-resolver-v23` because this source-proven header classification and all accepted Objective-C facts remain file-local. A pre-v0.81 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes the expanded Objective-C facts.
- No SQLite schema migration or query command is required. This is an additive language-discovery capability within the existing Objective-C artifact, graph, source-search, CLI, MCP, incremental-index, and evidence contracts; existing generations remain readable.

### Deliberate limits

- `.h` is still not a general C/C++/Objective-C classifier: only direct source-proven Objective-C interface/protocol headers are indexed. Categories/extensions, properties, imports, inheritance/protocol-conformance relations, C/C++ declarations, message calls, Swift bridging, compiler configuration, conditional-compilation semantics, and runtime behavior remain outside scope. Git change-set/hunk attribution remains path-only and therefore does not yet select `.h` files without source content.
- The inspected local CodeGraph baseline maps `.h` through content heuristics and has Tree-sitter extraction across C/C++/Objective-C plus broader cross-language resolution. SymbolLattice v0.81 is narrower for general header syntax but deliberately stronger about requiring a direct complete Objective-C container after comment/string/macro blanking; it is independently implemented and not a CodeGraph source copy.

## [0.80.0] - 2026-07-31

### Added

- Pascal Horse route extraction now accepts direct main-program Patch registrations in addition to Get, Post, Put, and Delete. Every accepted registration still requires exactly one direct uses Horse proof, exactly one direct program main block, a one-line slash-prefixed literal path, and one unique prior same-file complete routine handler.
- Patch reuses the existing route node, routes edge, Pascal case-insensitive handler lookup, and framework.horse.direct-uses.literal-route.local-routine syntax evidence. Unit and integration coverage verifies exact Patch routes, handler proof, bounded route-method filtering, and continued Options rejection. The standalone Traditional Chinese comparison report is at C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.80.0.md.

### Compatibility

- The artifact extractor advances to multi-language-ast-v69; the project resolver remains project-resolver-v23 because every accepted Horse route and handler proof remains file-local. A pre-v0.80 active index reports indexer-version-changed until an explicit sync or index republishes the expanded Horse facts.
- No SQLite schema migration or query command is required. This is an additive framework capability expansion within the existing Pascal artifact, graph, route query, source-search, CLI, MCP, incremental-index, and evidence contracts; existing generations remain readable.

### Deliberate limits

- Head, Options, and every other Horse verb remain excluded. Combined or aliased uses, units, inline or multiline callbacks, aliases/wrappers/subclasses, groups, prefixes, middleware, nested registrations, dynamic paths, late or ambiguous handlers, cross-file handlers, compilation, and runtime behavior remain outside scope.
- The inspected local CodeGraph baseline has broad Tree-sitter Pascal extraction and form/callback support but no dedicated Horse or THorse framework rule in its local source search. SymbolLattice v0.80 is therefore narrower for general Pascal syntax but ahead for this explicit, evidence-bearing PATCH route subset; it is independently implemented and not a CodeGraph source copy.

## [0.79.0] - 2026-07-31

### Added

- Objective-C .m and Objective-C++ .mm extraction now accepts complete direct ordinary @interface and @protocol containers alongside the existing direct non-category @implementation subset. Ordinary interfaces emit one class symbol, protocols emit one interface symbol, and one-line semicolon-terminated instance/class method declarations emit exact contained method symbols.
- A same-file ordinary interface and implementation with the same class name intentionally merge into one class symbol. When both state the same selector, the complete implementation method wins over the declaration; interface-only selectors stay visible. Unit and integration coverage verifies protocol containment, selector preservation, implementation precedence, Objective-C++ persistence, category/extension exclusion, and malformed-protocol fail-closed behavior. The standalone Traditional Chinese comparison report is at C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.79.0.md.

### Compatibility

- The artifact extractor advances to multi-language-ast-v68; the project resolver remains project-resolver-v23 because every accepted Objective-C fact remains file-local. A pre-v0.79 active index reports indexer-version-changed until an explicit sync or index republishes the expanded Objective-C facts.
- No SQLite schema migration or query command is required. This is an additive language capability expansion within the existing Objective-C artifact, graph, source-search, CLI, MCP, incremental-index, and evidence contracts; existing generations remain readable.

### Deliberate limits

- This remains a narrow lexical declaration scanner, not a general Objective-C parser, compiler, header analyzer, or runtime analyzer. It excludes .h headers, categories/extensions, properties, imports, inheritance/protocol-conformance relations, C/C++ declarations, message calls, Swift bridging, compiler configuration, and runtime behavior. Interfaces and protocols accept only direct one-line semicolon-terminated methods; implementations accept only direct one-line brace-bodied methods.
- The inspected local CodeGraph baseline has a Tree-sitter Objective-C extractor and Swift-Objective-C bridge resolution, so it remains materially broader for language syntax and cross-language relationships. SymbolLattice v0.79 independently adds a smaller, evidence-bearing interface/protocol subset and does not copy CodeGraph source or claim full parity.

## [0.78.0] - 2026-07-31

### Added

- Pascal Horse route extraction now accepts direct main-program Put and Delete registrations in addition to the existing Get and Post subset. Every accepted registration still requires exactly one direct uses Horse proof, exactly one direct program main block, a one-line slash-prefixed literal path, and one unique prior same-file complete routine handler.
- Put and Delete reuse the existing route node, routes edge, Pascal case-insensitive handler lookup, and framework.horse.direct-uses.literal-route.local-routine syntax evidence. Unit and integration coverage verifies exact routes, handler proof, bounded route-method filtering, and continued Patch rejection. The standalone Traditional Chinese comparison report is at C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.78.0.md.

### Compatibility

- The artifact extractor advances to multi-language-ast-v67; the project resolver remains project-resolver-v23 because every accepted Horse route and handler proof remains file-local. A pre-v0.78 active index reports indexer-version-changed until an explicit sync or index republishes the expanded Horse facts.
- No SQLite schema migration or query command is required. This is an additive framework capability expansion within the existing Pascal artifact, graph, route query, source-search, CLI, MCP, incremental-index, and evidence contracts; existing generations remain readable.

### Deliberate limits

- Patch, Head, Options, and every other Horse verb remain excluded. Combined or aliased uses, units, inline or multiline callbacks, aliases/wrappers/subclasses, groups, prefixes, middleware, nested registrations, dynamic paths, late or ambiguous handlers, cross-file handlers, compilation, and runtime behavior remain outside scope.
- The inspected local CodeGraph baseline has broad Tree-sitter Pascal extraction and form/callback support but no dedicated Horse or THorse framework rule in its local source search. SymbolLattice v0.78 is therefore narrower for general Pascal syntax but ahead for this explicit, evidence-bearing Horse route subset; it is independently implemented and not a CodeGraph source copy.

## [0.77.0] - 2026-07-31

### Added

- Objective-C .m and Objective-C++ .mm source discovery, persisted source-search filtering, CLI/MCP language validation, and an independently implemented lexical implementation extractor.
- A complete direct non-category @implementation ClassName ... @end block now emits one class symbol. Direct one-line brace-bodied instance and class methods emit contained method symbols, including multi-part selector names such as create:with:.
- The scanner blanks line comments, block comments, quoted literals, and preprocessor directives while preserving offsets. This prevents macro, comment, and string text from fabricating declarations. Unit and integration coverage verifies .m/.mm discovery, selector extraction, source-search filtering, exact containment evidence, category/header rejection, malformed-source fail-closed behavior, and Objective-C++ indexing. The standalone Traditional Chinese comparison report is at C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.77.0.md.

### Compatibility

- The artifact extractor advances to multi-language-ast-v66; the project resolver remains project-resolver-v23 because every accepted Objective-C fact is file-local. A pre-v0.77 active index reports indexer-version-changed until an explicit sync or index republishes Objective-C-capable facts.
- No SQLite schema migration or query command is required. Objective-C is additive to the existing artifact, graph, source-search, CLI, MCP, incremental-index, and evidence contracts; existing generations remain readable.

### Deliberate limits

- This is not a general Objective-C parser, compiler, header analyzer, or runtime analyzer. It excludes .h headers, @interface and @protocol declarations, categories/extensions, properties, imports, inheritance, C/C++ declarations, Objective-C message calls, Swift bridging, compiler configuration, and runtime behavior. Only direct complete implementation bodies are eligible.
- The inspected local CodeGraph baseline has a dedicated Objective-C Tree-sitter extractor and Swift-Objective-C bridge resolution, so it remains broader for language syntax and cross-language relationships. SymbolLattice v0.77 independently adds a smaller evidence-bearing declaration subset and does not copy CodeGraph source or claim full parity.

## [0.76.0] - 2026-07-31

### Added

- A first conservative Pascal Horse HTTP framework capability. One source file now emits exact `GET` / `POST` route facts only when it proves exactly one direct `uses Horse;`, exactly one direct `program` main block, a one-line literal `THorse.Get` or `THorse.Post` registration at the main-block level, and one unique prior same-file complete Pascal routine handler.
- Accepted registrations use the existing `route` node and `routes` edge contracts with `framework.horse.direct-uses.literal-route.local-routine` syntax evidence. Route handler lookup follows Pascal's case-insensitive identifier semantics, while source-search, CLI/MCP `pascal` filtering, persisted artifact facts, and the existing bounded route query remain unchanged. Unit and integration coverage verifies handler resolution, `GET` / `POST` selection, nested-route rejection, absent-`Horse` proof rejection, persisted source search, and route queries. The standalone Traditional Chinese comparison report is at `C:\\Users\\win10\\Desktop\\Graph\\FEATURE_COMPARISON_v0.76.0.md`.

### Compatibility

- No SQLite schema migration or query command is required. `horse` is an additive framework capability and route-framework value using the existing Pascal artifact, graph, source-search, CLI, MCP, and incremental-index contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v65`; the project resolver remains `project-resolver-v23` because every accepted Horse route and handler proof is file-local. A pre-v0.76 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Horse-capable facts.

### Deliberate limits

- This is not general Horse or Pascal framework analysis. It deliberately rejects combined or aliased `uses` clauses, no-program/unit source, inline or multiline registrations, `Put` / `Delete` / other methods, dynamic/query/fragment/double-slash paths, late/ambiguous/dynamic/cross-file handlers, nested or routine-local registrations, groups, middleware, prefixes, aliases, wrappers, `THorse` subclasses, compilation, and runtime behavior.
- The inspected local CodeGraph baseline has Tree-sitter Pascal extraction plus `.dfm` / `.fmx` form and callback support, which is broader Pascal coverage. Its local source search found no dedicated `Horse` / `THorse` rule. SymbolLattice v0.76 independently adds a smaller evidence-bearing Horse route subset rather than copying CodeGraph source or claiming full Horse parity.

## [0.75.0] - 2026-07-31

### Added

- Pascal `.pas`, `.dpr`, `.dpk`, and `.lpr` source discovery, persisted source-search filtering, CLI/MCP language validation, and an independently implemented lexical declaration pass. It retains only direct column-one complete `procedure` / `function` implementations, including direct dotted and `class` routine names, as exact file-local `contains` evidence.
- The scanner blanks `//`, `{...}`, `(*...*)`, and quoted Pascal source before testing declarations, handles simple `var` sections and nested `begin`/`case`/`try`/`repeat`/type blocks while finding a routine body, and fails closed for incomplete routines or unterminated comments/strings. Unit and integration coverage verifies discovery, direct functions, procedures, dotted/class names, comments/strings, nested blocks, incomplete declarations, malformed source, persisted search, and route absence. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.75.0.md`.

### Compatibility

- No SQLite schema migration or query command is required. `pascal` is an additive artifact language using the existing file, symbol, containment, source-search, CLI, MCP, and incremental-index contracts; existing generations remain readable. The root package metadata in `package-lock.json` is also realigned with `package.json` at `0.75.0`.
- The artifact extractor advances to `multi-language-ast-v64`; the project resolver remains `project-resolver-v23` because this language slice is file-local and produces no module or framework projection. A pre-v0.75 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Pascal-capable facts.

### Deliberate limits

- This is not a Pascal grammar, compiler, unit/project resolver, or runtime analyzer. It excludes `.dfm` / `.fmx`, forward/interface declarations, indented or local routines, constructors/destructors/operators/generics, overload/directive forms, type/class/interface symbols, uses/import/module/call analysis, VCL/FMX/Lazarus forms, Horse/Brook/WebBroker or other framework inference, compilation, and runtime behavior.
- The inspected local CodeGraph baseline uses a dedicated Tree-sitter Pascal grammar and also maps `.dfm` / `.fmx`; it therefore has broader syntax and extension coverage. SymbolLattice v0.75 deliberately keeps a smaller lexical proof boundary with explicit complete-body requirements; it is independently implemented and does not reuse CodeGraph source.

## [0.74.0] - 2026-07-31

### Added

- Luau `.luau` source discovery, persisted source-search filtering, CLI/MCP language validation, and a conservative reuse of the balanced Lua lexical declaration surface. Valid Luau source now retains direct top-level `function`, `local function`, and `export function` declarations even when the file contains `--!strict`, type aliases, and parameter or return type annotations.
- Luau deliberately does not activate the Lua-only `lapis` framework pass. A syntactically similar `require("lapis")` / `app:get(...)` sequence in a `.luau` file retains ordinary declarations but cannot fabricate a Lapis route. Unit and integration coverage verifies discovery, strict/type syntax, exported functions, fail-closed malformed input, persisted source search, and Lua-framework isolation. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.74.0.md`.

### Compatibility

- No SQLite schema migration or query command is required. `luau` is an additive artifact language using the existing file, symbol, containment, source-search, CLI, MCP, and incremental-index contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v63`; the project resolver remains `project-resolver-v23` because this language slice is file-local and provides no module or framework projection. A pre-v0.74 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Luau-capable facts.

### Deliberate limits

- This is not a Luau parser, type checker, Roblox project model, or runtime analyzer. It excludes `type` / `export type` symbols, generic function declarations, class-like tables/metatables, module/import/require resolution, calls, table fields, Roblox services/Instances/events/RemoteEvents, Roact/Fusion/framework conventions, Lapis routes, compilation, and runtime behavior.
- The inspected local CodeGraph baseline uses a dedicated Tree-sitter Luau grammar and therefore has broader syntax coverage. SymbolLattice v0.74 deliberately keeps the existing lexical proof boundary and only accepts declaration forms shared safely with Lua; it is independently implemented and does not reuse CodeGraph source.

## [0.73.0] - 2026-07-31

### Added

- A first conservative Django framework capability for Python: a direct `from django.urls import path [as alias]`, the final literal top-level `urlpatterns = [...]` list, and a prior same-file top-level function handler now create exact `ALL` route nodes and `framework.django.direct-urlpatterns.path.local-function` syntax evidence. The conventional empty path maps to `/`, and literal Django converters such as `users/<int:user_id>/` are retained verbatim.
- Unit and integration coverage verifies direct aliases, final-assignment and rebinding proof, exact local handlers, source search, persisted extractor provenance, and rejection of leading-slash paths, dynamic values, missing or late handlers, nonlocal handler shapes, `re_path`, `include`, class-based views, metadata other than a literal `name`, and unsupported `kwargs`. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.73.0.md`.

### Compatibility

- No SQLite schema migration or query command is required. `django` is an additive route-framework value and `ALL` Django facts reuse the existing route, edge-evidence, source-search, and capability contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v62`; the project resolver remains `project-resolver-v23` because this initial Django slice produces only same-file syntax evidence. A pre-v0.73 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Django-capable facts.

### Deliberate limits

- This is not a generic Django resolver or runtime model. It intentionally excludes `re_path` / legacy `url`, `include`, routers, REST framework registrations, class-based `as_view` handlers, dotted or imported handlers, cross-file URLConf/view resolution, nested URL patterns, `urlpatterns +=`, assignment aliases, `path` calls with options other than a literal `name`, dynamic/escaped/query/fragment paths, middleware/settings/namespace/app-name semantics, and runtime URL resolution.
- The inspected local CodeGraph baseline recognizes a broader Django surface, including `path`, `re_path`, `url`, `include`, class-based handlers, and DRF router registration patterns. SymbolLattice v0.73 deliberately trades that breadth for AST-proven direct-import, final-binding, and exact local-handler evidence; it is independently implemented and does not reuse CodeGraph source.

## [0.72.0] - 2026-07-31

### Added

- Laravel Blade `.blade.php` source discovery, persisted source-search filtering, CLI/MCP language validation, and an independent offset-preserving lexical directive scanner. It retains only complete direct literal `@extends`, `@include`, `@component`, and `@each` forms outside HTML comments, Blade comments, raw PHP, `@php ... @endphp`, and `@verbatim ... @endverbatim` blocks.
- An executable first-party `laravel-blade` capability. A safe dotted logical view name projects only to the conventional indexed `resources/views/<name-as-path>.blade.php` file. Existing targets receive exact `calls` edges; missing targets remain explicit unresolved evidence with rule-specific provenance rather than guessed namespaced/package/configured-view matches.
- Unit and integration coverage now verifies Blade discovery, exact and unresolved layout/view callers, raw-fact persistence, language search, capability registration, reuse/reprojection after target changes, and comment/literal-block/dynamic/path-traversal/escaped/malformed rejection. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.72.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Blade reuses the existing file, `calls` edge, caller/callee, source-search, and raw-artifact contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v61` and the resolver to `project-resolver-v23` because complete raw Blade facts are projected only after the full indexed file catalog is known. A pre-v0.72 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Blade-capable facts and relations.

### Deliberate limits

- The Blade scanner is a deliberately narrow lexical directive scanner, not a Blade/PHP grammar, Laravel compiler, container analyzer, view finder, or renderer. It accepts only complete direct literal dotted view names with a small exact argument-tail grammar; unterminated protected blocks or directive parentheses fail closed.
- Blade support does not infer `view()` / `View::make()` calls, component tag syntax, anonymous components, layouts/sections/stacks, slots, `@includeWhen` / `@includeFirst`, namespaced or package views, custom finder roots, dynamic or conditional expressions, PHP/Laravel service integration, compilation, or runtime rendering. The inspected local CodeGraph baseline has Laravel PHP route resolution but no Blade-specific `.blade.php` extractor or resolver; SymbolLattice adds only independently implemented project-local template relationship evidence.

## [0.71.0] - 2026-07-31

### Added

- Twig `.twig` source discovery, persisted source-search filtering, CLI language validation, and an independent offset-preserving lexical template-tag scanner. It retains only complete direct literal `extends`, `include`, `embed`, `import`, and `from ... import` forms outside HTML comments, Twig comments, and `verbatim` blocks.
- An executable first-party `twig` capability. Safe literal names ending in `.twig` project only to the conventional indexed `templates/<name>.twig` root. Existing target files receive exact `calls` edges; missing targets remain explicit unresolved edges with rule-specific evidence instead of guessed loader, namespace, or bundle matches.
- SQLite raw-artifact persistence now retains Liquid and Solidity facts as well as Twig facts. The v0.71 extractor-version bump forces an explicit re-extraction before stale facts can be reused.
- Unit and integration coverage now verifies Twig discovery, direct template and macro references, exact and unresolved targets, raw-fact persistence, capability registration, comments/verbatim/dynamic/unsafe/malformed rejection, plus the Liquid and Solidity persistence regression. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.71.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Twig reuses the existing file, `calls` edge, caller/callee, source-search, and raw-artifact contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v60` and the resolver to `project-resolver-v22` because complete raw template facts are projected only after the full project file catalog is known. A pre-v0.71 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Twig-capable facts and relations.

### Deliberate limits

- The Twig scanner is a deliberately narrow lexical tag scanner, not a Twig grammar, Symfony/PHP analyzer, loader resolver, compiler, or renderer. It accepts only complete literal `.twig` names and a small exact tag-tail grammar; malformed delimiters, unterminated comments or `verbatim` blocks, or nested tags fail closed.
- Twig support does not infer template loader namespaces, bundles, configured roots, dynamic/conditional expressions, `with` maps, macro or block bodies, inheritance chains, PHP/Symfony services, compilation, or runtime rendering. The inspected local CodeGraph baseline currently records Twig at file level; SymbolLattice adds only independently implemented, project-local relationship evidence.

## [0.70.0] - 2026-07-31

### Added

- VB.NET `.vb` source discovery, persisted source-search filtering, CLI language validation, and an independent offset-preserving lexical declaration scanner. It retains complete `Namespace`, `Class`, `Module`, `Interface`, `Structure`, and `Enum` containers, plus complete direct `Sub` / `Function` declarations and bodyless direct interface / `MustOverride` signatures.
- Complete file-level, unaliased `Imports Namespace.Name` statements are retained as explicit pending `imports` references. They are source-syntax evidence only; this release does not claim .NET assembly or project reference resolution.
- Unit and integration coverage now verifies VB.NET discovery, nested namespace/container/member containment, interface signatures, simple imports, comments/strings/malformed rejection, persisted source search, and CLI language filtering. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.70.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. VB.NET reuses the existing file, module, class, interface, type, function, method, containment-edge, pending-reference, source-search, and raw-artifact contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v59`; the resolver remains `project-resolver-v21` because v0.70 does not resolve `Imports` through assemblies, projects, packages, or source files. A pre-v0.70 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes VB.NET-capable facts.

### Deliberate limits

- The VB.NET scanner is a deliberately narrow line-oriented declaration scanner, not a VB.NET parser, Roslyn compiler, CLR analyzer, WinForms/WPF analyzer, or runtime debugger. It accepts only complete literal block forms whose closing `End ...` structure can be locally proved; unclosed strings and malformed/mismatched supported blocks fail closed.
- VB.NET support does not infer attributes, aliases/static imports, fields, properties, events, delegates, P/Invoke, generic/overload/type semantics, inheritance, `Handles`, calls, lambda/local functions, partial-type merging, project/assembly/NuGet resolution, MSBuild, compilation, UI designer resources, or runtime behavior. The inspected local CodeGraph baseline uses Tree-sitter and is broader for these surfaces; SymbolLattice deliberately begins with a smaller independently implemented declaration contract.

## [0.69.0] - 2026-07-31

### Added

- Nix `.nix` source discovery, persisted source-search filtering, CLI language validation, and an independent offset-preserving lexical declaration scanner. It retains complete direct bindings of a returned literal attribute set, including `rec { ... }`, direct `let ... in` bindings, simple `inherit` names, and direct lambda-valued bindings as function symbols.
- Complete literal project-relative `import ./path.nix` and `builtins.import ../path.nix` forms are retained as explicit pending `imports` references. They are evidence of source syntax only: v0.69 does not yet claim a Nix module target or evaluate the path.
- Unit and integration coverage now verifies Nix discovery, returned attribute-set and `let` declaration scopes, function/value/inherit evidence, literal import facts, string/comment/malformed rejection, persisted source search, and CLI language filtering. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.69.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Nix reuses the existing file, function, variable, containment-edge, pending-reference, source-search, and raw-artifact contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v58`; the resolver remains `project-resolver-v21` because v0.69 retains literal import syntax without evaluating Nix expressions or projecting cross-file module edges. A pre-v0.69 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Nix-capable facts.

### Deliberate limits

- The Nix scanner is a deliberately narrow lexical declaration scanner, not a Nix parser, evaluator, flake lock reader, package builder, or deployment planner. It accepts only complete literal structures whose delimiter and string/comment boundaries can be locally proved; malformed or ambiguous comments, strings, delimiters, and `let` forms fail closed.
- Nix support does not infer quoted/dynamic attribute names, nested attribute-set members, `with`, assertions, overlays, derivations, flake inputs/outputs, angle-bracket lookups, import target resolution, `callPackage`, arbitrary calls, package dependencies, evaluation results, NixOS/Home Manager module composition, lock-file semantics, builds, or runtime deployment behavior. The inspected local CodeGraph baseline uses Tree-sitter and is broader for calls, `callPackage`, and module-list file imports; SymbolLattice deliberately begins with a smaller independently implemented declaration contract.

## [0.68.0] - 2026-07-31

### Added

- CFML / CFScript `.cfc`, `.cfm`, and `.cfs` source discovery, persisted source-search filtering, CLI language validation, and an independent offset-preserving declaration scanner. It retains only complete braced CFScript `component` / `interface` containers with direct named functions, complete tag-based `<cfcomponent>` / `<cfinterface>` containers with named `<cffunction>` members, and the conventional implicit CFC component form for complete top-level CFScript functions.
- Unit and integration coverage now verifies CFML discovery, braced/tag/implicit declaration forms, direct containment evidence, quoted/commented/malformed/incomplete rejection, persisted source search, and CLI language filtering. The standalone Traditional Chinese comparison report is at `C:\\Users\\win10\\Desktop\\Graph\\FEATURE_COMPARISON_v0.68.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. CFML reuses the existing file, class, interface, function, method, containment-edge, source-search, and raw-artifact contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v57`; the project resolver remains `project-resolver-v21` because this initial CFML slice does not project imports, includes, calls, or cross-file relationships. A pre-v0.68 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes CFML-capable facts.

### Deliberate limits

- The CFML scanner is a deliberately narrow declaration scanner, not a CFML parser, Adobe ColdFusion/Lucee runtime, template renderer, query analyzer, or framework analyzer. It accepts only complete literal forms whose parent structure can be locally proved; unclosed comments, strings, braces, tags, and function declarations fail closed.
- CFML support does not infer `cfinclude`, `import`, component inheritance, accessors, annotations, dynamic names, closures, nested/member functions, `cfscript` blocks inside tag-based components, CFQuery SQL or hash expressions, calls, ORM/DI/framework conventions, request lifecycle, remote services, compilation, or runtime behavior. The inspected local CodeGraph baseline uses Tree-sitter and is broader for CFScript imports, variables, calls, and embedded CFQuery; SymbolLattice deliberately begins with a smaller independently implemented declaration contract.

## [0.67.0] - 2026-07-31

### Added

- Solidity `.sol` source discovery, persisted source-search filtering, CLI language validation, and an independent offset-preserving lexical scanner. It retains only complete top-level literal `contract`, `interface`, and `library` declarations together with complete direct `function`, `modifier`, `constructor`, `fallback`, and `receive` members.
- A same-file-only Solidity inheritance projection. A complete simple `is Base, Other` clause becomes an exact `extends` or `implements` edge only when one declaration in that same indexed file proves the target kind. Constructor-argument clauses, imports, missing, duplicate, and incompatible targets do not become hierarchy edges.
- Unit and integration coverage now verifies Solidity discovery, symbols, member containment, string/comment and malformed-source rejection, persisted source search, CLI language filtering, and exact `hierarchy` parent/child evidence. The standalone Traditional Chinese comparison report is at `C:\\Users\\win10\\Desktop\\Graph\\FEATURE_COMPARISON_v0.67.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Solidity reuses the existing file, class, interface, method, hierarchy-edge, source-search, and raw-artifact contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v56` and the project resolver to `project-resolver-v21` because exact Solidity `is` relations are projected only after all symbols in the same complete source file are known. A pre-v0.67 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Solidity-capable facts and edges.

### Deliberate limits

- The Solidity extractor is a deliberately narrow lexical declaration scanner, not a Solidity parser, compiler, EVM analyzer, or deployment simulator. It accepts only complete ASCII-named top-level containers and complete direct callable members while preserving string/comment offsets; malformed source and unclosed strings/comments fail closed.
- Solidity support does not infer imports, cross-file inheritance, inherited constructor arguments, visibility/override semantics, structs, enums, user-defined value types, state variables, events, errors, free functions, calls, emits, reverts, modifiers applied to members, assembly, inline Yul, ABI/bytecode, storage layout, proxy/delegatecall behavior, external dependencies, compilation, or runtime chain behavior. The inspected local CodeGraph baseline has a broader Tree-sitter Solidity extractor for those surfaces; SymbolLattice deliberately begins with smaller exact declaration and same-file hierarchy evidence.

## [0.66.0] - 2026-07-31

### Added

- Shopify Liquid `.liquid` source discovery, persisted source-search language filtering, CLI/MCP validation, and a dedicated offset-preserving template-tag scanner. It retains only complete direct literal `render`, `include`, and `section` tags outside HTML comments and Liquid `comment` / `raw` blocks.
- An executable first-party `shopify-liquid` capability. A literal `render` or `include` target projects to the exact indexed `snippets/<name>.liquid` file; a literal `section` target projects to the exact indexed `sections/<name>.liquid` file. Missing targets remain explicit unresolved `calls` edges with rule-specific evidence instead of guessed global matches.
- Unit and integration coverage now verifies Liquid discovery, literal render/include/section facts, exact local snippet/section callers, comment/raw/HTML-comment/dynamic/path-traversal/malformed rejection, persisted source-search, and CLI/MCP language validation. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.66.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Liquid facts reuse the existing file, graph-edge, source-search, caller/callee, and SQLite raw-artifact contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v55` and the project resolver to `project-resolver-v20` because literal Liquid targets are projected only after the complete indexed file set is available. A pre-v0.66 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes Liquid-capable facts and edges.

### Deliberate limits

- The Liquid extractor is a deliberately narrow tag scanner, not a Liquid parser, Shopify theme compiler, or renderer. It accepts only direct literal names made from safe path segments; dynamic names, path traversal, incomplete/nested tags, comment/raw/HTML-comment contents, and malformed delimiters do not become template facts.
- Shopify support does not infer `assign`, captures, loops, conditions, filters, object/property references, layouts, schema JSON, app blocks, {% render %} parameter semantics, JSON template/section-group references, metafields, locales, theme configuration, remote snippets, theme inheritance, or runtime storefront behavior. The inspected local CodeGraph baseline has broader Liquid extraction for snippet/section references, schema, assignments, and Shopify JSON section references; SymbolLattice deliberately starts with a smaller exact cross-file call contract rather than claiming full Liquid parity.

## [0.65.0] - 2026-07-31

### Added

- Terraform/OpenTofu `.tf`, `.tfvars`, and `.tofu` source discovery, persisted source-search language filtering, CLI/MCP validation, and a dedicated offset-preserving HCL block scanner. It retains only complete line-leading top-level literal `resource`, `data`, `module`, `variable`, and `output` blocks as auditable IaC declarations.
- An executable first-party `terraform` capability. Accepted resource/data blocks use the additive `resource` symbol kind, module blocks use the additive `module` symbol kind, and output blocks are exported variable symbols; every retained declaration has exact local `contains` evidence.
- Unit and integration coverage now verifies Terraform/OpenTofu discovery, resource/data/module/variable/output containment, output export/local bindings, comment/string/heredoc/dynamic/nested/malformed rejection, persisted source-search, CLI/MCP language validation, and exact resource lookup. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.65.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. The additive `resource` and `module` symbol kinds reuse the existing file, symbol, edge, binding, and source-search contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v54`; the project resolver remains `project-resolver-v19` because this release does not resolve Terraform module sources, providers, or dependency expressions. A pre-v0.65 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes Terraform-capable facts.

### Deliberate limits

- The Terraform/OpenTofu extractor is a deliberately narrow lexical scanner, not an HCL parser, Terraform/OpenTofu compiler, or planner. It accepts only complete line-leading top-level blocks with literal ASCII labels; comments, quoted strings, heredocs, dynamic labels, nested blocks, malformed input, and unsupported top-level forms do not become IaC facts.
- Terraform/OpenTofu support does not infer `terraform`, `provider`, `locals`, expression values, interpolation, `depends_on`, resource references, provider aliases, module source resolution, state, plan/apply behavior, generated configuration, or runtime cloud topology. The inspected local CodeGraph baseline uses a broader Tree-sitter Terraform grammar; SymbolLattice deliberately adds a smaller exact declaration-evidence surface rather than claiming full HCL parity.

## [0.64.0] - 2026-07-31

### Added

- ArkTS `.ets` source discovery, persisted source-search language filtering, CLI/MCP validation, and a dedicated offset-preserving ArkTS scanner. It retains only complete direct `@Component struct` declarations as auditable component symbols; a directly positioned `export` is retained as an export binding.
- An executable first-party `arkui` capability. A complete direct `@Entry @Component struct` declaration emits a `ui root <Component>` entrypoint and an exact local `framework.arkui.entry-component.local-struct` `handles` edge. The existing read-only `entrypoints` contract now accepts the additive `ui` transport and `root` operation.
- Unit and integration coverage now verifies `.ets` discovery, component/root containment and exact handler evidence, exported component bindings, comment/string/non-struct/malformed rejection, persisted entrypoint-query integration, source-search, and CLI/MCP language validation. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.64.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. ArkTS component symbols and ArkUI root entrypoints reuse the existing file, symbol, edge, source-search, and entrypoint-query contracts. The `ui` / `root` filter values are additive; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v53`; the project resolver remains `project-resolver-v19` because every accepted ArkUI root edge is proved inside one `.ets` file. A pre-v0.64 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes ArkTS-capable facts.

### Deliberate limits

- The ArkTS extractor is a deliberately narrow lexical scanner, not an ArkTS compiler or a TypeScript fallback. It retains only complete line-leading direct `@Component struct` declarations, with `@Entry` accepted only when it belongs to the same adjacent decorator stack. Comments, strings, regex literals, malformed bodies, detached decorators, non-struct declarations, generic ArkTS declarations, and general TypeScript syntax do not become component facts.
- ArkUI support does not infer `build()` DSL calls, child-component usage, `@Builder`/`@Extend`/`@Styles`, state decorators, lifecycle behavior, navigation, bundles, modules, packages, or runtime UI composition. The inspected local CodeGraph baseline has a broader Tree-sitter ArkTS extractor for struct members, decorators, and ArkUI call shapes; SymbolLattice deliberately adds a smaller UI-root evidence surface rather than claiming full ArkTS parity.

## [0.63.0] - 2026-07-31

### Added

- Razor/Blazor `.razor` source discovery, persisted source-search language filtering, CLI/MCP validation, and a bounded component extractor. Every discovered file emits a conventional local `default` component with auditable containment/export/local-binding facts.
- An executable first-party `blazor` capability. Each standalone, unescaped, slash-prefixed string-literal `@page` directive emits a `NAVIGATE` route node and exact local-default-component `framework.blazor.page-directive.local-handler` evidence. Multiple literal route templates, including literal parameter templates, remain distinct.
- Unit and integration coverage now verifies Razor discovery, conventional component evidence, literal/multiple directive routing, comment/computed/`@attribute`/query-fragment rejection, source-search/CLI/MCP language validation, persisted route-query integration, and exact caller evidence. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.63.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Razor symbols and Blazor navigation reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v52`; the project resolver remains `project-resolver-v19` because every accepted route resolves only to a same-file conventional component. A pre-v0.63 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes Razor-capable facts.

### Deliberate limits

- The Razor extractor is a deliberately small directive scanner, not the Razor compiler or a C# parser. It excludes `@code`/`@functions` members, `@inject`/`@model`/`@inherits` references, template component tags, layouts/render modes, generic Razor namespace/project/package resolution, and runtime behavior.
- Blazor navigation accepts only standalone unescaped literal `@page` directives in `.razor` files. It excludes `@attribute [Route(...)]`, computed/escaped/query/fragment forms, Razor comments, `.cshtml`, route configuration, and runtime behavior. The inspected local CodeGraph baseline has a broader Razor extractor for directive type references, Blazor component tags, and C# code blocks; SymbolLattice adds a distinct narrow precision surface by turning only direct literal `@page` declarations into exact local route evidence rather than claiming full Razor parity.

## [0.62.0] - 2026-07-31

### Added

- Astro `.astro` source discovery, persisted source-search language filtering, CLI/MCP validation, and a bounded SFC extractor. A file with no frontmatter, or one valid opening TypeScript frontmatter fence, emits a conventional `default` component plus direct frontmatter functions, classes, interfaces, type aliases, and identifier variables. An incomplete/malformed starting fence or invalid frontmatter syntax fails closed to the file node.
- An executable first-party `astro` capability. A static literal-segment `src/pages/**/*.astro` file emits a `NAVIGATE` route node and exact local-default-component `framework.astro.filesystem-page.local-handler` evidence; `index.astro` maps to its containing path. Dynamic brackets and leading-underscore segments are deliberately excluded instead of guessed.
- Relative TypeScript/JavaScript resolution now considers a unique `.astro` candidate, enabling exact direct conventional-default bindings without adding a generic Astro package resolver.
- Unit and integration coverage now verifies Astro discovery, frontmatter declarations, conventional default evidence, malformed-fence/frontmatter rejection, static/dynamic/private Astro page handling, `.astro` resolution, source-search/CLI/MCP language validation, and persisted route-query integration. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.62.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Astro symbols and Astro page navigation reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v51`; the project resolver advances to `project-resolver-v19` because a unique relative `.astro` candidate may now prove an exact TypeScript/JavaScript module binding. A pre-v0.62 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes Astro-capable facts.

### Deliberate limits

- The Astro extractor is a deliberately small SFC scanner, not the Astro compiler. It excludes frontmatter imports/re-exports, template components/calls, client `<script>` tags, styles/directives/islands, `Astro` global/props semantics, generic Astro import/export/call/type analysis, and runtime behavior.
- Astro routing accepts only static `.astro` pages with literal non-private segments under `src/pages`; it excludes Markdown/MDX/HTML pages, `.ts`/`.js` endpoints, dynamic/rest parameters, routing configuration, middleware, cross-file page composition, and runtime navigation. The inspected local CodeGraph baseline processes Astro frontmatter and client scripts, scans template component/call usage, and maps broader `src/pages` route forms including dynamic parameters and JavaScript/TypeScript endpoints. SymbolLattice adds a different narrow precision slice: every accepted page route is tied to its local conventional component with exact evidence rather than claiming full Astro parity.

## [0.61.0] - 2026-07-31

### Added

- Svelte `.svelte` source discovery, persisted source-search language filtering, CLI/MCP validation, and a bounded SFC extractor. A validated file emits a conventional `default` component plus direct top-level instance-script functions, classes, interfaces, type aliases, and identifier variables. It accepts no script, or at most one inline JavaScript/TypeScript instance script and one inline JavaScript/TypeScript module script; module scripts are syntax-validated but their declarations are not yet indexed.
- An executable first-party `sveltekit` capability. A static `src/routes/**/+page.svelte` path with literal filesystem segments emits a `NAVIGATE` route node and exact local-default-component `framework.sveltekit.filesystem-page.local-handler` evidence. Bracket, route-group, optional, and rest conventions are deliberately excluded instead of guessed.
- Relative TypeScript/JavaScript resolution now considers a unique `.svelte` candidate, enabling exact direct conventional-default bindings without adding a generic Svelte package resolver.
- Unit and integration coverage now verifies Svelte discovery, direct declarations, conventional default evidence, duplicate/`src`/non-JS/malformed script rejection, static/dynamic SvelteKit page handling, `.svelte` resolution, source-search/CLI/MCP language validation, and persisted route-query integration. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.61.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Svelte symbols and SvelteKit navigation reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v50`; the project resolver advances to `project-resolver-v18` because a unique relative `.svelte` candidate may now prove an exact TypeScript/JavaScript module binding. A pre-v0.61 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes Svelte-capable facts.

### Deliberate limits

- The Svelte extractor is a deliberately small SFC scanner, not the Svelte compiler. It excludes templates/styles, component/call edges, runes/macros, compiler-generated exports, props semantics, module-script declarations, multiple or `src` scripts, non-JavaScript/TypeScript scripts, generic Svelte import/export/call/type analysis, and runtime behavior.
- SvelteKit support accepts only static literal-segment `src/routes/**/+page.svelte` paths and the SFC's local conventional default component. It excludes layouts, endpoints, actions, hooks, dynamic/optional/rest bracket paths, route groups, client-router configuration, cross-file page composition, and runtime navigation. The inspected local CodeGraph baseline has a fuller Svelte extractor that processes script blocks and scans template component/call usage; no dedicated SvelteKit static filesystem route extractor was found in the inspected source, so SymbolLattice adds a different, narrowly proven navigation surface rather than claiming full Svelte parity.

## [0.60.0] - 2026-07-31

### Added

- Vue `.vue` source discovery, persisted source-search language filtering, CLI/MCP validation, and a bounded SFC extractor for one inline JavaScript/TypeScript `<script>` block. It retains direct top-level declarations and three auditable direct default-export forms: an object literal, a direct unaliased `defineComponent(...)` call, or a direct named variable initialized from that call.
- An executable first-party `vue-router` capability. Client-navigation facts require exactly one direct, unaliased `createRouter` import from `vue-router`, exactly one top-level `createRouter({ routes })` expression, a literal route array/options form, slash-prefixed literal paths, and named component identifiers. A unique same-file or imported Vue default component produces exact `framework.vue-router.create-router.routes-option.*` evidence; all other accepted route targets remain explicit `unresolved` evidence.
- Relative TypeScript/JavaScript resolution now considers a unique `.vue` candidate, enabling exact direct default-import route components without adding a generic Vue package resolver.
- Unit and integration coverage now verifies Vue discovery, exports, malformed/multiple/`src`/non-JS script rejection, direct Vue Router static routes, alias/rebinding/lazy/dynamic rejection, `.vue` resolution, source-search/CLI/MCP language validation, and persisted route-query integration. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.60.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Vue symbols and Vue Router navigation reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v49`; the project resolver advances to `project-resolver-v17` because a unique relative `.vue` candidate may now prove an exact TypeScript/JavaScript module binding. A pre-v0.60 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes Vue-capable facts.

### Deliberate limits

- The Vue extractor is a deliberately small SFC scanner, not the Vue compiler. It excludes `script setup` implicit compiler exports, templates/styles/custom blocks, multiple or `src` scripts, macros/composables, aliases/rebindings, generic Vue semantic analysis, and runtime behavior.
- Vue Router support accepts only exact-one direct imports, one literal top-level router/routes form, literal slash-prefixed paths, and named component identifiers. It excludes child/nested route records, spreads, lazy/inline/dynamic components, aliases/factories, history/middleware configuration, cross-file router composition, and runtime navigation. The local CodeGraph baseline has a fuller Vue extractor that creates component nodes, processes script blocks, and scans template component usage; SymbolLattice gains a different narrow precision slice for direct router-to-component navigation rather than claiming equivalent Vue coverage.

## [0.59.0] - 2026-07-31

### Added

- Nim `.nim` source discovery, persisted source-search language filtering, CLI/MCP validation, and an isolated Nim lexical/comment/delimiter/layout extractor for direct top-level zero-argument `proc` containment.
- An executable first-party `jester` capability. Direct Jester route facts require exactly one top-level direct `import` list containing `jester`, a direct top-level `routes:` or `router name:` block, a direct baseline-indented literal `get` / `post` / `put` / `patch` / `delete` / `head` / `options` / `trace` / `connect` route, and one simple named zero-argument call in its body. A unique same-file zero-argument `proc` produces `framework.jester.direct-route-block.literal-named-proc.local-proc`; every other accepted handler remains explicit `unresolved` evidence.
- Unit and integration coverage now verifies Nim discovery, direct zero-argument `proc` containment, exact and unresolved Jester route-query/source-search behavior, missing/aliased/repeated-import, dynamic/inline/multi-statement/nested/long-string/shadowed rejection, malformed delimiter/comment and tab-layout fail-closed behavior, and CLI/MCP language validation. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.59.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Nim symbols and Jester routes reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v48`; the project resolver remains `project-resolver-v16` because all accepted Jester callback proof is file-local. A pre-v0.59 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes Nim-capable facts.

### Deliberate limits

- The Nim extractor is a deliberately small lexical/comment/delimiter/layout implementation, not a full Nim parser. It retains only file symbols for unbalanced delimiters, unterminated strings/comments, or tab-indented code, and does not claim generic Nim module, type, call, package, macro, or runtime analysis.
- Jester support accepts only exactly one direct top-level import list containing unaliased `jester`, direct top-level `routes:` / simple `router name:` blocks, one flat baseline of literal unescaped slash-prefixed paths, simple named zero-argument calls, and unique same-file zero-argument `proc` handlers. It excludes `from jester import`, aliases, repeated imports, `before` / `after` / `error` handlers, dynamic/special/regex/escaped paths, inline or multi-statement route bodies, nested control-flow/composition, top-level Jester-DSL rebinding, parameterized/generic/async/cross-file procedures, and runtime behavior. The local CodeGraph baseline does not list Nim in its indexed language set; SymbolLattice adds a narrow audited language/framework slice rather than claiming wider generic Nim parity.

## [0.58.0] - 2026-07-31

### Added

- F# `.fs` source discovery, persisted source-search language filtering, CLI/MCP validation, and an isolated F# lexical/comment/delimiter/layout extractor for direct top-level typed `HttpFunc` / `HttpContext` function containment.
- An executable first-party `giraffe` capability. Direct Giraffe route facts require exactly one top-level `open Giraffe` proof, a direct top-level `let name = choose [` list or its immediately following indented `choose [` form, direct baseline-indented literal `GET` / `POST` / `PUT` / `PATCH` / `DELETE` / `HEAD` / `OPTIONS` / `TRACE` / `CONNECT` / unqualified `route` registrations, and a simple named handler. A unique same-file typed function produces `framework.giraffe.direct-choose.literal-named-function.local-function`; every other accepted handler remains explicit `unresolved` evidence.
- Unit and integration coverage now verifies F# discovery, direct typed function containment, exact and unresolved Giraffe route-query/source-search behavior, dynamic/inline/qualified/nested/repeated-open rejection, malformed delimiter/comment and tab-layout fail-closed behavior, and CLI/MCP language validation. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.58.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. F# symbols and Giraffe routes reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v47`; the project resolver remains `project-resolver-v16` because all accepted Giraffe callback proof is file-local. A pre-v0.58 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes F#-capable facts.

### Deliberate limits

- The F# extractor is a deliberately small lexical/comment/delimiter/layout implementation, not a full F# parser. It retains only file symbols for unbalanced delimiters, unterminated strings/comments, or tab-indented code, and does not claim generic F# module, type, call, project, package, or runtime analysis.
- Giraffe support accepts only exactly one direct top-level `open Giraffe`, direct top-level literal `choose` lists, simple direct one-level method / `route` compositions, literal unescaped slash-prefixed paths, and simple same-file typed named handlers. It excludes `GET_HEAD`, `subRoute` / nested composition, aliases or top-level `route` / HTTP-handler rebinding, endpoint-routing integration, dynamic/escaped paths, anonymous/qualified/cross-file handlers, untyped/annotated/pattern/local handler forms, and runtime behavior. The local CodeGraph baseline does not list F# in its indexed language set; SymbolLattice adds a narrow audited language/framework slice rather than claiming wider generic F# parity.

## [0.57.0] - 2026-07-31

### Added

- OCaml `.ml` source discovery, persisted source-search language filtering, CLI/MCP validation, and an isolated OCaml lexical/comment/delimiter extractor for direct top-level one-parameter `let name arg = ...` function containment.
- An executable first-party `dream` capability. Direct Dream route facts require either a top-level direct `let name = Dream.router [` list or one of the documented direct `Dream.run` / `@@ Dream.router [` forms, a direct baseline-indented literal `Dream.get/post/put/delete/head/connect/options/trace/patch/any` registration, and a simple named handler. A unique same-file one-parameter function produces `framework.dream.direct-router.literal-named-function.local-function`; every other accepted handler remains explicit `unresolved` evidence.
- Unit and integration coverage now verifies OCaml discovery, direct function containment, exact and unresolved Dream route-query/source-search behavior, dynamic/inline/qualified/scoped/local/wrong-entrypoint rejection, malformed delimiter/comment/raw-string fail-closed behavior, and CLI/MCP language validation. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.57.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. OCaml symbols and Dream routes reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v46`; the project resolver remains `project-resolver-v16` because all accepted Dream callback proof is file-local. A pre-v0.57 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes OCaml-capable facts.

### Deliberate limits

- The OCaml extractor is a deliberately small lexical/comment/delimiter implementation, not a full OCaml parser. It retains only file symbols for unbalanced delimiters or unterminated strings, raw strings, or nested comments, and does not claim generic OCaml module, type, call, import, package, or runtime analysis.
- Dream support accepts only direct top-level literal `Dream.router` lists, the three specified direct `Dream.run` pipeline forms, simple direct one-parameter top-level `let` functions, literal unescaped slash-prefixed paths, and simple same-file named handlers. It excludes `Dream.scope`, `Dream.serve`, runtime options/composition, anonymous/qualified/cross-file handlers, dynamic/escaped paths, local or typed/pattern handlers, and runtime behavior. The local CodeGraph baseline does not list OCaml in its indexed language set; SymbolLattice adds a narrow audited language/framework slice rather than claiming wider generic OCaml parity.

## [0.56.0] - 2026-07-31

### Added

- Haskell `.hs` source discovery, persisted source-search language filtering, CLI/MCP validation, and an isolated Haskell lexical/comment/delimiter/layout extractor for simple column-zero zero-argument `name = ...` function containment.
- An executable first-party `scotty` capability. Direct Scotty route facts require exactly one column-zero `import Web.Scotty` proof, a column-zero `name = scotty <decimal-port> $ do` header, a direct baseline-indented literal `get/post/put/delete/patch/options` registration, and a simple named handler. A unique same-file zero-argument function produces `framework.scotty.direct-block.literal-named-function.local-function`; every other accepted handler remains explicit `unresolved` evidence.
- Unit and integration coverage now verifies Haskell discovery, direct function containment, exact and unresolved Scotty route-query/source-search behavior, qualified-import/dynamic-port/dynamic-path/inline/nested/repeated-import rejection, malformed delimiter/comment and tab-layout fail-closed behavior, and CLI/MCP language validation. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.56.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Haskell symbols and Scotty routes reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v45`; the project resolver remains `project-resolver-v16` because all accepted Scotty callback proof is file-local. A pre-v0.56 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes Haskell-capable facts.

### Deliberate limits

- The Haskell extractor is a deliberately small lexical/layout-aware implementation, not a full Haskell parser. It retains only file symbols for unbalanced delimiters, unterminated strings/comments, or tabs, and does not claim generic Haskell module, type, call, import, package, or runtime analysis.
- Scotty support accepts only exactly one direct `import Web.Scotty`, literal decimal-port `scotty ... $ do` blocks, simple direct block-level named routes, and direct top-level zero-argument functions. It excludes qualified/selective/repeated imports, `scottyT`, dynamic ports/paths, `addroute`/`matchAny`, inline `do` handlers, nested statements, local callbacks, cross-file handlers, and runtime behavior. The local CodeGraph baseline does not list Haskell in its indexed language set; SymbolLattice adds a narrow audited language/framework slice rather than claiming wider generic Haskell parity.

## [0.55.0] - 2026-07-31

### Added

- Julia `.jl` source discovery, persisted source-search language filtering, CLI/MCP validation, and an isolated Julia lexical/delimiter/block-balancing extractor for simple top-level one-line `name(...) = ...` function containment.
- An executable first-party `genie` capability. Direct Genie route facts require exactly one direct top-level `using Genie` proof, a direct statement-start literal `route("/path", name)` registration, and either the default `GET` or an exact literal `method = GET/POST/PUT/PATCH/DELETE/OPTIONS` keyword. A unique same-file one-line function produces `framework.genie.direct-route.literal-named-function.local-function`; every other accepted handler remains explicit `unresolved` evidence.
- Unit and integration coverage now verifies Julia discovery, direct function containment, exact and unresolved Genie route-query/source-search behavior, import/dynamic/inline/named/qualified-method/nested/repeated-use rejection, malformed delimiter/block and unterminated quote fail-closed behavior, and CLI/MCP language validation. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.55.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Julia symbols and Genie routes reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v44`; the project resolver remains `project-resolver-v16` because all accepted Genie callback proof is file-local. A pre-v0.55 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes Julia-capable facts.

### Deliberate limits

- The Julia extractor is a deliberately small lexical/delimiter/block-balancing implementation, not a full Julia parser. It retains only file symbols for unbalanced delimiters or blocks, unterminated strings/comments, or unsupported char/triple-string input, and does not claim generic Julia module, macro, call, type, import, package, or runtime analysis.
- Genie support accepts only exactly one direct top-level `using Genie` proof, simple direct top-level one-line function definitions, literal direct named-handler paths, and direct literal method keywords. It excludes `import Genie`, inline `do ... end` handlers, named routes, qualified constants, dynamic/escaped paths, generic wrapper/module/function/macro semantics, cross-file handlers, and runtime behavior. The local CodeGraph baseline does not list Julia in its indexed language set; SymbolLattice adds a narrow audited language/framework slice rather than claiming wider generic Julia parity.

## [0.54.0] - 2026-07-30

### Added

- Perl `.pl` / `.pm` source discovery, persisted source-search language filtering, CLI/MCP validation, and an isolated Perl lexical/delimiter-balancing extractor for an optional direct `package` plus simple top-level `sub` containment.
- An executable first-party `dancer2` capability. Direct Dancer2 route facts require exactly one direct `use Dancer2;`, a direct top-level literal `get` / `post` / `put` / `patch` / `del` / `options` registration, and an exact `\&name` coderef. A unique same-file `sub` produces `framework.dancer2.direct-route.literal-verb.local-sub`; every other accepted handler remains explicit `unresolved` evidence.
- Unit and integration coverage now verifies Perl discovery, direct package/function containment, exact and unresolved Dancer2 route-query/source-search behavior, import-list/dynamic/inline/`any`/nested/repeated-use rejection, malformed delimiter and unterminated quote fail-closed behavior, and CLI/MCP language validation. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.54.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Perl symbols and Dancer2 routes reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v43`; the project resolver remains `project-resolver-v16` because all accepted Dancer2 callback proof is file-local. A pre-v0.54 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes Perl-capable facts.

### Deliberate limits

- The Perl extractor is a deliberately small lexical/delimiter-balancing implementation, not a full Perl parser. It retains only file symbols for unbalanced delimiters or unterminated quoted input, and does not claim generic Perl package, module, call, type, regex, heredoc, POD, or runtime analysis.
- Dancer2 support accepts only exactly one direct `use Dancer2;`, at most one direct `package`, simple direct top-level `sub`, literal direct verb paths, and simple same-file named coderefs. It excludes import lists/aliases/multiple direct uses, `any`, named routes, prefixes/hooks/plugins, inline/qualified/wrapped/cross-file handlers, dynamic/escaped paths, prototypes/attributes/nested subs, generic package resolution, and runtime behavior. The local CodeGraph baseline does not list Perl in its indexed language set; SymbolLattice adds a narrow audited language/framework slice rather than claiming wider generic Perl parity.

## [0.53.0] - 2026-07-30

### Added

- Clojure `.clj` source discovery, persisted source-search language filtering, CLI/MCP validation, and a deliberately isolated Clojure lexical/delimiter-balancing extractor for exactly one direct `ns` plus simple top-level `defn` containment.
- An executable first-party `compojure` capability. Direct Compojure route facts now require a direct namespace `:require` proof containing exactly one `[compojure.core :refer :all]` or explicit `[compojure.core :refer [defroutes verb ...]]` vector, a top-level `defroutes`, literal direct HTTP-verb paths, and a simple named handler. A unique same-file `defn` produces `framework.compojure.direct-defroutes.literal-verb.local-function`; every other accepted handler remains explicit `unresolved` evidence.
- Unit and integration coverage now verifies Clojure discovery, direct namespace/function containment, exact and unresolved Compojure route-query/source-search behavior, explicit `:refer :all` proof, alias/dynamic/inline/nested rejection, malformed delimiter and unterminated quote fail-closed behavior, and CLI/MCP language validation. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.53.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Clojure symbols and Compojure routes reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v42`; the project resolver remains `project-resolver-v16` because all accepted Compojure callback proof is file-local. A pre-v0.53 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes Clojure-capable facts.

### Deliberate limits

- The Clojure extractor is a deliberately small lexical/delimiter-balancing implementation, not a full Clojure reader or parser. It retains only file symbols for unbalanced delimiters or unterminated quoted input, and does not claim generic Clojure namespace, macro, call, type, module, or runtime analysis.
- Compojure support accepts only one direct `compojure.core` `:refer` proof, direct simple top-level `defn`, a top-level `defroutes`, literal direct verb paths, and simple same-file named handlers. It excludes aliases/namespaced macro calls, `:use` or dynamic dependency forms, `context` / `routes` / `ANY`, middleware, docstring/metadata/private/multi-arity `defn` forms, inline/qualified/cross-file handlers, dynamic/escaped paths, generic namespace resolution, and runtime behavior. The local CodeGraph baseline does not list Clojure in its indexed language set; SymbolLattice adds a narrow audited language/framework slice rather than claiming wider generic Clojure parity.

## [0.52.0] - 2026-07-30

### Added

- Erlang `.erl` source discovery, persisted source-search language filtering, CLI/MCP validation, and a deliberately isolated Erlang lexical/delimiter-balancing extractor for direct `-module`, `-export`, and simple top-level function containment.
- An executable first-party `cowboy` capability. Direct Cowboy route facts now require one direct `cowboy_router:compile([{'_', [...] }])` wildcard-host dispatch list, literal slash-prefixed unescaped string paths, unquoted handler atoms, and literal three-item `{Path, Handler, InitialState}` tuples. A unique same-module exported `init/2` produces `framework.cowboy.direct-router.literal-wildcard-host.local-exported-init`; any other accepted handler remains explicit `unresolved` evidence.
- Unit and integration coverage now verifies Erlang discovery, direct module/export/function containment, exact and unresolved Cowboy route-query/source-search behavior, dynamic/non-wildcard/binary/constrained/indirect route rejection, malformed delimiter and unterminated quote fail-closed behavior, and CLI/MCP language validation. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.52.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Erlang symbols and Cowboy routes reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v41`; the project resolver remains `project-resolver-v16` because all accepted Cowboy callback proof is file-local. A pre-v0.52 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes Erlang-capable facts.

### Deliberate limits

- The Erlang extractor is a deliberately small lexical/delimiter-balancing implementation, not a full Erlang parser. It retains only file symbols for unmatched delimiters or unterminated quoted input, and does not claim generic Erlang behaviour, call, type, record, OTP, include, parse-transform, module-resolution, or runtime analysis.
- Cowboy support accepts only a direct literal wildcard-host dispatch list and resolves only a unique same-module exported `init/2`. It excludes multiple/specific hosts, host/path constraints, binary/dynamic/escaped paths, quoted or macro-generated handlers, dispatch variables, aliases, nested router calls, cross-file handlers, and runtime behavior. The local CodeGraph baseline lists generic Erlang language support but has no detected Cowboy-specific route extractor; SymbolLattice adds a narrow audited framework slice rather than claiming broader generic Erlang parity.

## [0.51.0] - 2026-07-30

### Added

- Elixir `.ex` / `.exs` source discovery, persisted source-search language filtering, CLI/MCP validation, and a deliberately isolated Elixir lexical/block-balancing extractor for direct top-level `defmodule` containment plus direct module `def` / `defp` methods.
- An executable first-party `phoenix` capability. Exact Phoenix route facts now require a direct module-level `use Phoenix.Router` (optionally `helpers: false`), literal nested `scope` prefixes, one direct literal `get` / `post` / `put` / `patch` / `delete` / `head` / `options` / `trace` / `connect` route, a full controller module, and an atom action. A unique direct same-file module method produces `framework.phoenix.direct-router.literal-verb.full-module-controller-action.local-method`; any other accepted controller action remains explicit `unresolved` evidence.
- Unit and integration coverage now verifies Elixir discovery, direct module/method containment, nested scope composition, exact and unresolved route-query/source-search behavior, indirect/missing router proof, dynamic/unsupported/nested-route rejection, malformed block and unterminated string fail-closed behavior, and CLI/MCP language validation. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.51.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Elixir symbols and Phoenix routes reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v40`; the project resolver remains `project-resolver-v16` because all accepted Elixir and Phoenix proof is file-local. A pre-v0.51 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes Elixir-capable facts.

### Deliberate limits

- The Elixir extractor is a deliberately small lexical/block-balancing implementation, not a full Elixir parser. It retains only file symbols for unmatched `do` / `end` or unterminated quoted/charlist/heredoc input, and does not claim generic Elixir import, alias, call, type, macro, protocol, OTP, or runtime analysis.
- Phoenix support accepts only a direct `use Phoenix.Router` module binding, literal direct scopes, literal direct HTTP-verb paths, full-module controller atom actions, and direct same-file module methods. It excludes customary `use AppWeb, :router` macro expansion, aliases/imports, `resources`, `match`, `forward`, pipelines, router/controller factories, macro-generated forms, `def name, do:` methods, nested modules, dynamic/raw/escaped paths, generic cross-file resolution, and runtime behavior. The local CodeGraph baseline does not list Elixir in its indexed language set; SymbolLattice adds a narrow audited language/framework slice rather than claiming wider Elixir parity.

## [0.50.0] - 2026-07-30

### Added

- R `.r` / `.R` source discovery, persisted source-search language filtering, CLI/MCP validation, and a deliberately isolated R lexical/delimiter-balancing extractor for direct top-level braced `name <- function(...)` and `name = function(...)` containment.
- An executable first-party `plumber` capability. Exact route facts now require a standalone top-level `#*` or `#'` annotation with a literal slash-prefixed `@get`, `@post`, `@put`, or `@delete` path immediately followed by a top-level braced anonymous `function(...) { ... }` handler. Every accepted edge carries `framework.plumber.annotation.literal-route.braced-handler` evidence.
- Unit and integration coverage now verifies R discovery, direct function containment, `#*` and `#'` annotations, exact route-query/source-search behavior, dynamic/unsupported/non-immediate/named/nested rejection, assignment-continuation rejection, unbalanced delimiter or unterminated quoted/backtick fail-closed behavior, and CLI/MCP language validation. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.50.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. R symbols and Plumber routes reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v39`; the project resolver remains `project-resolver-v16` because all accepted R and Plumber proof is file-local. A pre-v0.50 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes R-capable facts.

### Deliberate limits

- The R extractor is a deliberately small lexical/delimiter-balancing implementation, not a full R parser. It retains only file symbols for unbalanced delimiters or unterminated quoted/backtick input, and does not claim generic R package, import, call, type, expression, S3/S4, or runtime analysis.
- Plumber support accepts only standalone top-level `#*` / `#'` annotations, plain literal slash-prefixed paths, `get` / `post` / `put` / `delete` directives, and immediately following top-level braced anonymous function handlers. It excludes `head`, `patch`, programmatic `pr_*` / `Plumber$handle` registration, filters, mounts, route groups, OpenAPI annotations, named/inline/nested handlers, aliases/wrappers, dynamic/raw/escaped paths, generic R package resolution, and runtime behavior. The local CodeGraph baseline has broader generic R indexing through its dedicated grammar but no Plumber-specific resolver; SymbolLattice adds a narrow audited framework surface rather than claiming R parity.

## [0.49.0] - 2026-07-30

### Added

- Lua `.lua` source discovery, persisted source-search language filtering, CLI/MCP validation, and a deliberately isolated Lua lexical extractor for direct top-level `function` and `local function` containment.
- An executable first-party `lapis` capability. Exact route facts now require direct `local lapis = require("lapis")` followed by `local app = lapis.Application()`, or direct `local app = require("lapis").Application()`, then one direct literal `app:get`, `app:post`, `app:put`, `app:delete`, or `app:match` registration with exactly one unique, prior, un-rebound same-file `local function` handler. `match` is represented as `ALL`; verb shortcuts retain their matching HTTP method and every accepted edge carries `framework.lapis.direct-application.literal-route.local-function` evidence.
- Unit and integration coverage now verifies Lua discovery, top-level function containment, Lapis two-step/direct application bindings, named route forms, exact route-query/source-search behavior, dynamic path/inline-handler/missing-framework/rebound/late-handler rejection, unbalanced-source fail-closed behavior, and CLI/MCP language validation. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.49.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Lua symbols and Lapis routes reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v38`; the project resolver remains `project-resolver-v16` because all accepted Lua and Lapis proof is file-local. A pre-v0.49 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes Lua-capable facts.

### Deliberate limits

- The Lua extractor is a deliberately small lexical/block-balancing implementation, not a full Lua parser. It retains only file symbols for unbalanced block/parenthesis or unterminated string/comment input, and does not claim generic Lua import, call, table, type, module, coroutine, metatable, macro, or runtime analysis.
- Lapis support accepts only parenthesized `require("lapis")`, direct local `Application()` bindings, top-level `get` / `post` / `put` / `delete` / `match` calls, plain literal slash-prefixed paths, and direct prior local function handlers. It excludes MoonScript, `Application:extend`, `include`, `respond_to`, route tables, inline/global/imported/cross-file handlers, aliases/wrappers, groups/prefixes, dynamic/raw/escaped paths, receiver/handler rebinding, nested control flow, method dispatch inside an action, and runtime behavior. The local CodeGraph baseline has broader generic Lua indexing through its dedicated grammar but no Lapis resolver; SymbolLattice adds a narrow audited framework surface rather than claiming Lua parity.

## [0.48.0] - 2026-07-30

### Added

- C `.c` source discovery, persisted source-search language filtering, CLI/MCP validation, and direct top-level function containment through a deliberately separate C extractor. C++ source files remain on their existing cpp-httplib path.
- An executable first-party `civetweb` capability. A route now requires a direct `<civetweb.h>` or `"civetweb.h"` include, a direct `mg_set_request_handler(context, "/literal", handler, cbdata)` registration in a direct function body, one literal slash-prefixed URI, and one unique unshadowed same-file top-level handler function. CivetWeb handler registration does not bind an HTTP method, so matching routes are represented as `ALL` and retain `framework.civetweb.direct-request-handler.literal-uri.local-function` evidence.
- Unit and integration coverage now verifies C discovery, direct function containment, exact C source-search and `ALL` route-query behavior, quoted/system header forms, dynamic URI rejection, missing-header rejection, duplicate handler rejection, local-shadow rejection, and syntax-error fail-closed behavior. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.48.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. C symbols and CivetWeb routes reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v37`; the project resolver remains `project-resolver-v16` because all accepted CivetWeb proof is file-local. A pre-v0.48 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes C-capable facts.

### Deliberate limits

- The C extractor intentionally accepts only common parser-proven top-level function forms. It does not claim full C preprocessing, macro expansion, header graph resolution, C type checking, function-pointer data-flow, cross-file handler resolution, nested control-flow registration, or runtime behavior.
- CivetWeb support excludes indirect/wrapper registration, dynamic/raw/escaped URIs, non-identifier context or handler expressions, duplicate handlers, potentially shadowed handlers, aliases, non-direct body statements, WebSocket/auth callbacks, per-method request inspection, and runtime route behavior. The local CodeGraph baseline already indexes C with a dedicated parser but has no CivetWeb resolver; SymbolLattice adds a narrow audited framework surface rather than claiming broad C parity.

## [0.47.0] - 2026-07-30

### Added

- Play controller-action resolution now accepts one uniquely proven direct Java package/class/method target as well as the existing Scala proof. Java package facts are additive raw artifact facts; a same-name Scala and Java candidate remains explicitly unresolved rather than selecting one by language.
- Literal Play `-> /prefix package.Router` rows now emit a `MOUNT ...` route-kind node and an exact or unresolved `handles` edge. Exact mounts use `framework.play.conf-routes.literal-router-mount.package-class` evidence; missing or ambiguous Router class targets retain `framework.play.conf-routes.literal-router-mount.unresolved-router` evidence. A mount is deliberately absent from the concrete HTTP `routes` inventory.
- SQLite raw artifact persistence now writes both `scalaFacts` and `javaFacts`. This closes the v0.46 omission that could drop Scala package facts on a later incremental sync, while preserving older artifact payloads as readable.
- Unit and integration coverage now verifies Java package facts, exact Java Play controller resolution, Scala/Java raw-fact reuse across unrelated `sync` runs, literal Router mount exact/unresolved evidence, and rejection of dynamic/wildcard Router prefixes. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.47.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. `scalaFacts`, `javaFacts`, and Router-mount facts are additive JSON payload fields inside the existing raw artifact-facts store; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v36` and the project resolver to `project-resolver-v16`. A pre-v0.47 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes persisted Scala/Java package facts and Play mount evidence.

### Deliberate limits

- The accepted mount form is only a literal slash-prefix and fully qualified Router class name. Dynamic/wildcard prefixes, unqualified Router names, Router-interface type checking, recursive mounted-router endpoint expansion, `build.sbt` detection, imported/classpath Router targets, and runtime behavior remain outside this release.
- Play controller actions still require exactly one direct package/class/object and exactly one direct method. Overloads, binders, reverse routing, generic Scala/Java type resolution, and runtime semantics remain deliberately unresolved. CodeGraph remains broader in Play project detection and action matching; SymbolLattice v0.47 adds a narrow audited mount edge that CodeGraph currently skips.

## [0.46.0] - 2026-07-30

### Added

- Play route extraction now preserves the full controller-action spelling as a `PendingReference`, while Scala source facts retain the direct package proof for every indexed class/object symbol.
- The project resolver now emits an exact `routes` edge with `framework.play.conf-routes.literal-controller-action.package-class-method` evidence only when one fully static controller action has exactly one direct package match, exactly one class/object, and exactly one direct body method. Candidate class and method symbol IDs remain auditable in the edge evidence.
- Missing methods and wrong-package handlers remain explicitly unresolved with `framework.play.conf-routes.literal-controller-action.unresolved-handler`; this resolver never uses a global simple-name guess.
- Unit and integration coverage now verifies raw Play pending facts, full controller-action names, exact cross-file route resolution, and fail-closed incomplete package-class-method proof. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.46.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. The existing file, symbol, edge, source-search, and route-query contracts are reused; `scalaFacts` is additive in the raw artifact-fact payload and existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v35` and the project resolver to `project-resolver-v15`. A pre-v0.46 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes the full Play controller-action facts and exact project projection.

### Deliberate limits

- Play exact resolution is deliberately narrower than generic Scala name resolution: it accepts only literal `conf/routes` / `conf/*.routes` entries whose fully static action can be proven through one direct package clause, one class/object, and one direct body method. It excludes `->` includes, route prefixes/composition, `build.sbt` detection, imported/classpath controller resolution, overload resolution, binders, reverse routing, Scala 3 contextual declarations, and runtime behavior.
- CodeGraph's Play resolver remains broader in project detection, route-file composition, and controller-action resolution. SymbolLattice v0.46 adds independently auditable package-class-method uniqueness proof, but it does not claim general Scala or Play parity.

## [0.45.0] - 2026-07-30

### Added

- Scala `.scala` source discovery, persisted source-search language filtering, CLI/MCP validation, direct top-level class/object/trait/method/function containment, and a first-party `@ast-grep/lang-scala` AST adapter.
- An executable first-party `play` capability. Play route discovery now includes only `conf/routes` and `conf/*.routes`; each accepted literal HTTP verb/path/controller-action row emits `framework.play.conf-routes.literal-controller-action.unresolved-handler` evidence and an explicitly unresolved `routes` edge.
- The shared dynamic ast-grep language registry now registers C#, Ruby, Kotlin, Swift, Dart, and Scala together, preserving every first-party prebuilt grammar in the same long-lived process.
- Capability, discovery, direct route-table extraction, explicit unresolved route-query behavior, class/object/trait/method/function containment, malformed/non-Play route-row and syntax-error rejection, source-search, CLI, and persisted route-query integration coverage. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.45.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Scala symbols and Play route-table entries reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v34`; the project resolver remains `project-resolver-v14` because accepted Play controller handlers remain deliberately unresolved in this release. A pre-v0.45 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes the new facts.

### Deliberate limits

- Scala support accepts direct top-level class/object/trait/function forms and direct body `def` members only. Play support accepts only literal `conf/routes` / `conf/*.routes` controller-action rows and leaves all targets unresolved. It excludes `->` includes, prefixes/composition, `build.sbt` detection, controller/package/import/classpath/overload resolution, custom binders, reverse routing, Scala 3 contextual declarations, generic Scala call/type resolution, and runtime behavior.
- CodeGraph's Play resolver is broader: it detects `build.sbt` or Play configuration, handles extensionless and included route files, parses controller-action argument forms, and resolves a `Controller.method` reference to an indexed action method. SymbolLattice v0.45 deliberately ships a separate AST-backed Scala symbol layer plus a conservative static route-table parser whose controller targets remain explicitly unresolved; it is behind CodeGraph's Play controller-resolution coverage.

## [0.44.0] - 2026-07-30

### Added

- Dart `.dart` source discovery, persisted source-search language filtering, CLI/MCP validation, direct top-level class/method/function containment, and a first-party `@ast-grep/lang-dart` AST adapter.
- An executable first-party `flutter` capability. Flutter navigation now requires a direct `import 'package:flutter/material.dart';`, a direct `MaterialApp` literal `routes` map, a literal slash-prefixed key, a one-parameter arrow builder, and one unique direct same-file widget class. Matching routes emit exact `framework.flutter.direct-material-app.literal-routes-map.local-widget-class` evidence with `NAVIGATE` semantics.
- The shared dynamic ast-grep language registry now registers C#, Ruby, Kotlin, Swift, and Dart together, preserving every first-party prebuilt grammar in the same long-lived process.
- Capability, discovery, exact navigation, class/method/function containment, dynamic/closure/missing-import/wrong-app/missing-target/malformed-source rejection, source-search, CLI, and persisted route-query integration coverage. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.44.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Dart symbols and Flutter navigation reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v33`; the project resolver remains `project-resolver-v14` because all supported Flutter proof is file-local. A pre-v0.44 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes the new facts.

### Deliberate limits

- Flutter support accepts only the direct literal `MaterialApp(routes: {...})` form with one-parameter arrow builders that instantiate a unique same-file no-argument class. It excludes `MaterialApp.router`, `CupertinoApp`, `home` / `onGenerateRoute` / `Navigator` calls, aliases, spreads or typed/dynamic maps, dynamic/interpolated/escaped paths, closures, constructor arguments, non-class/cross-file targets, Dart package/module/type resolution, and runtime behavior.
- The checked CodeGraph baseline indexes Dart source files but has no Dart/Flutter framework resolver under `src/resolution/frameworks`. SymbolLattice v0.44 deliberately adds a narrow AST-proven Flutter navigation form with exact same-file widget evidence; CodeGraph remains broader across its other supported language and framework surfaces.

## [0.43.0] - 2026-07-30

### Added

- Swift `.swift` source discovery, persisted source-search language filtering, CLI/MCP validation, direct top-level class/struct/protocol/method/function containment, and a first-party `@ast-grep/lang-swift` AST adapter.
- An executable first-party `vapor` capability. Vapor routes now require a direct `import Vapor`, a direct `routes(_ app: Application)` function, a direct `app.` HTTP verb call, zero or more literal path segments, and one unique direct top-level same-file `use: handler` function. Matching routes emit exact `framework.vapor.direct-routes-application.literal-segment-route.use.local-function` evidence.
- The shared dynamic ast-grep language registry now registers C#, Ruby, Kotlin, and Swift together, preserving every first-party prebuilt grammar in the same long-lived process.
- Capability, discovery, exact route, class/struct/protocol/method/function containment, dynamic/closure/missing-import/wrong-function/wrong-parameter/missing-handler/malformed-source rejection, source-search, CLI, and persisted route-query integration coverage. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.43.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Swift symbols and Vapor routes reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v32`; the project resolver remains `project-resolver-v14` because all supported Swift proof is file-local. A pre-v0.43 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes the new facts.

### Deliberate limits

- Vapor support accepts only the direct literal `routes(_ app: Application)` / `app.<verb>(..., use: handler)` form. It excludes aliased imports/receivers, groups or prefixes, middleware, closure/member/qualified handlers, dynamic/interpolated/escaped path segments, overload/cross-file resolution, Swift package/module/type resolution, Fluent/controller semantics, and runtime behavior.
- CodeGraph has a broader regex-based Vapor resolver: it detects Vapor from `Package.swift` or imports, tracks direct `grouped` and `group` prefix variables, accepts routes on generic builders, and resolves a handler name through its framework-resolution flow. SymbolLattice v0.43 deliberately adds a narrower AST-proven direct route form with exact same-file handler evidence; it remains behind CodeGraph's broader Swift/Vapor coverage.

## [0.42.0] - 2026-07-30

### Added

- Kotlin `.kt` source discovery, persisted source-search language filtering, CLI/MCP validation, direct top-level class/interface/method/function containment, and a first-party `@ast-grep/lang-kotlin` AST adapter.
- An executable first-party `ktor` capability. Ktor routes now require direct unaliased imports of `io.ktor.server.application.Application`, `io.ktor.server.routing.routing`, and the used verb; a direct `fun Application.module()` function; one direct `routing { ... }` block; one literal slash-prefixed path; and one unique direct top-level `::handler` callable reference. Matching routes emit exact `framework.ktor.direct-application-module.routing.literal-route.callable-reference.local-function` evidence.
- The shared dynamic ast-grep language registry now registers C#, Ruby, and Kotlin together, preserving all previously supported prebuilt grammars in the same long-lived process.
- Capability, discovery, exact route, class/interface/method/function containment, dynamic/lambda/missing-import/wrong-module/missing-handler/malformed-source rejection, source-search, CLI, and persisted route-query integration coverage. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.42.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Kotlin symbols and Ktor routes reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v31`; the project resolver remains `project-resolver-v14` because all supported Kotlin proof is file-local. A pre-v0.42 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes the new facts.

### Deliberate limits

- Ktor support accepts only the direct literal `Application.module`/`routing` callable-reference form above. It excludes star/aliased imports, alternative module names/receivers, `route` / `authenticate` / `static` composition, lambda/member/qualified handlers, named arguments, dynamic/interpolated/escaped paths, overload/cross-file resolution, plugins/pipelines, generic Kotlin import/package/call/type resolution, and runtime behavior.
- CodeGraph indexes Kotlin in the local baseline but its current `src/resolution` source has no Ktor framework resolver. SymbolLattice v0.42 therefore introduces a narrow AST-proven Ktor route surface that CodeGraph does not currently expose, while remaining far behind CodeGraph's overall multi-language breadth.

## [0.41.0] - 2026-07-30

### Added

- Ruby `.rb` source discovery, persisted source-search language filtering, CLI/MCP validation, direct top-level class/method/function containment, and a first-party `@ast-grep/lang-ruby` AST adapter.
- An executable first-party `rails` capability. Rails routes now require a direct `Rails.application.routes.draw do ... end` block, one literal slash-prefixed `get` / `post` / `put` / `patch` / `delete` / `head` / `options` call, and exactly `to: "controller#action"`. Same-file non-namespaced controllers emit exact `framework.rails.direct-routes-draw.literal-controller-action.local-method` evidence; namespaced or cross-file controllers retain an explicit `unresolved` controller-action edge instead of a guessed target.
- A shared C#/Ruby ast-grep language registry. The runtime registers all first-party dynamic grammars in one replacement-safe call, so adding Ruby cannot hide the existing C# parser in a long-lived process.
- Capability, discovery, exact/unresolved route, unsupported verb/dynamic/resource/namespace/malformed-source rejection, source-search, CLI, and persisted route-query integration coverage. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.41.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Ruby symbols and Rails routes reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v30`; the project resolver remains `project-resolver-v14` because all supported Ruby proof is file-local. A pre-v0.41 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes the new facts.

### Deliberate limits

- Rails support accepts only the direct literal `routes.draw` form above. It excludes `resources` / `resource`, `namespace` / `scope`, route groups/prefixes, constraints, root/mount/redirect/match forms, lambdas and other non-controller handlers, controller aliases/namespaces, dynamic/interpolated/escaped values, generic Ruby import/package/call/type resolution, cross-file controller resolution, and runtime Rails behavior.
- CodeGraph has a broader regex-based Rails resolver: it detects Rails projects, extracts explicit `get` / `post` / `put` / `patch` / `delete` / `match` routes plus `resources` / `resource` expansions, and heuristically resolves controller actions across files at confidence `0.85`. SymbolLattice v0.41 intentionally adds a narrower AST-proven `routes.draw` surface with explicit exact-versus-unresolved controller evidence; it remains far behind CodeGraph's overall multi-language breadth.

## [0.40.0] - 2026-07-30

### Added

- C# `.cs` source discovery, persisted source-search language filtering, CLI/MCP validation, direct top-level class/interface/method/local-function containment, and a first-party `@ast-grep/napi` + `@ast-grep/lang-csharp` AST adapter with Windows prebuilt parser support.
- An executable first-party `aspnet-core` capability. Minimal API routes now require direct `WebApplication.CreateBuilder(...).Build()` or direct builder/`Build()` bindings, one literal slash-prefixed `MapGet` / `MapPost` / `MapPut` / `MapPatch` / `MapDelete` registration, and one unique direct named top-level local function handler. Matching routes emit `framework.aspnet-core.direct-web-application.literal-route.local-function` evidence; direct receiver reassignment invalidates the binding.
- Direct MVC controller evidence for a direct `Microsoft.AspNetCore.Mvc` import or fully-qualified MVC attributes, one `ApiController`, one literal `Route`, and one literal `Http*` method mapping on its direct local method. Matching routes emit `framework.aspnet-core.direct-api-controller.literal-route.method` evidence.
- Capability, discovery, Minimal API, MVC, fully-qualified attribute, dynamic/lambda/rebinding/missing-import rejection, malformed-source, source-search, CLI, and persisted route-query integration coverage. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.40.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. C# symbols and ASP.NET Core routes reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v29`; the project resolver remains `project-resolver-v14` because all supported C# proof is file-local. A pre-v0.40 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes the new facts.

### Deliberate limits

- ASP.NET Core support accepts only the direct Minimal API and MVC forms above. It excludes `MapMethods`, `MapGroup`, endpoint filters/middleware, lambdas/delegates/member/cross-file handlers, controller tokens/aliases, inheritance/interface resolution, nested types/scopes, configuration/DI semantics, semantic type checking, and runtime behavior.

## [0.39.0] - 2026-07-30

### Added

- C++ `.cpp`, `.cc`, `.cxx`, `.hpp`, `.hh`, and `.hxx` source discovery, persisted source-search language filtering, CLI/MCP validation, direct top-level class/method/function containment, and a first-party `@lezer/cpp` AST adapter.
- An executable first-party `cpp-httplib` capability. A route now requires direct `#include <httplib.h>` or `"httplib.h"` evidence, a direct `httplib::Server` or `httplib::SSLServer` local declaration in one direct top-level function body, one literal slash-prefixed URI, and one unique direct named top-level function handler. Matching routes emit `framework.cpp-httplib.direct-server.literal-route.local-function` evidence. Direct receiver assignment invalidates that receiver before later route extraction.
- Capability, discovery, exact route, include, dynamic/lambda/missing-handler/rebinding rejection, malformed-source, source-search, CLI, and persisted route-query integration coverage. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.39.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. C++ symbols and cpp-httplib routes reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v28`; the project resolver remains `project-resolver-v14` because all supported C++ proof is file-local. A pre-v0.39 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes the new facts.

### Deliberate limits

- cpp-httplib support accepts only direct header inclusion, direct scoped server declarations, direct local function-body receiver methods, literal paths, and unique top-level named function handlers. It excludes `using namespace`, aliases, factories, wrappers, nested scopes, lambdas/member/callback handlers, regex/raw/escaped/dynamic paths, cross-file or overload resolution, middleware hooks, and runtime behavior.
- CodeGraph has broader C++ language indexing but no equivalent dedicated cpp-httplib route pack in its current framework resolver set. SymbolLattice v0.39 intentionally adds a narrow AST-proven C++ HTTP route surface while remaining far behind CodeGraph's overall multi-language breadth.

## [0.38.0] - 2026-07-30

### Added

- PHP `.php` source discovery, persisted source-search language filtering, CLI/MCP validation, direct top-level class/method/function containment, and a first-party `@lezer/php` AST adapter.
- An executable first-party `laravel` capability. A route now requires a direct `Illuminate\Support\Facades\Route` import (including one explicit alias) or fully-qualified facade, one literal URI, one direct `get` / `post` / `put` / `patch` / `delete` / `options` / `any` facade call, and a literal `[Controller::class, 'action']` array. Same-file unqualified controllers emit exact `framework.laravel.direct-facade.literal-controller-action.local-method` evidence; cross-file controllers retain an explicit `unresolved` `Controller@action` edge instead of a guessed target.
- Capability, discovery, exact/unresolved route, alias, fully-qualified facade, dynamic/closure/resource rejection, malformed-source, source-search, CLI, and persisted route-query integration coverage. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.38.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. PHP symbols and Laravel routes reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v27`; the project resolver remains `project-resolver-v14` because PHP controller resolution is deliberately not inferred. A pre-v0.38 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes the new facts.

### Deliberate limits

- Laravel support accepts only direct/aliased imported or fully-qualified facade calls, one literal URI, and one literal controller-action array. It excludes controller/import/package resolution, route groups/prefixes/resources, `match`, closure/string/invokable handlers, redirects/views/fallbacks, middleware/configuration semantics, dynamic/escaped/interpolated values, grouped/wildcard imports, and runtime behavior. Cross-file controller action references are retained as unresolved evidence rather than mapped heuristically.
- CodeGraph has broader regex-based Laravel route, controller, and resource extraction. SymbolLattice v0.38 intentionally trades that breadth for AST-proven facade/import, literal URI/action, and explicit exact-versus-unresolved handler evidence in its first PHP/Laravel slice.

## [0.37.0] - 2026-07-30

### Added

- Java `.java` source discovery, persisted source-search language filtering, CLI/MCP validation, direct top-level class and direct method containment, and a first-party `@lezer/java` AST adapter.
- An executable first-party `spring-web` capability. A route now requires direct non-static/non-wildcard Spring annotation imports (or fully-qualified annotations), a direct `@RestController` or `@Controller`, an optional literal class-level `@RequestMapping` prefix, one literal direct `@GetMapping` / `@PostMapping` / `@PutMapping` / `@PatchMapping` / `@DeleteMapping` method annotation, and its exact local method. Matching routes emit `framework.spring-web.direct-controller.literal-method-mapping.local-method` evidence.
- Capability, discovery, exact route, fully-qualified annotation, import/dynamic/method-level-`RequestMapping` rejection, malformed-source, source-search, CLI, and persisted route-query integration coverage. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.37.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Java symbols and Spring Web routes reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v26`; the project resolver remains `project-resolver-v14` because the supported Java and Spring Web forms are file-local. A pre-v0.37 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes the new facts.

### Deliberate limits

- Spring Web support accepts only direct non-static/non-wildcard annotation imports or fully-qualified annotations, a direct controller class, an optional one-literal class prefix, and one one-literal shortcut method mapping on a direct local method. Method-level `@RequestMapping(method = ...)`, annotation arrays or multiple paths/conditions, placeholders or SpEL, custom/composed annotations, wildcard/static imports, nested/inherited/interface handlers, Java package/classpath resolution, semantic Spring configuration, and runtime behavior remain excluded.
- CodeGraph has broader Java declaration, project-level Spring detection, `@RequestMapping` method handling, Kotlin, configuration, and regex-based route extraction. SymbolLattice v0.37 intentionally trades that breadth for AST-proven annotation/import, literal-path, direct-controller, and exact local-method evidence in its first Java/Spring slice.

## [0.36.0] - 2026-07-30

### Added

- Rust `.rs` source discovery, persisted source-search language filtering, CLI/MCP validation, conservative top-level function containment, and a first-party `@lezer/rust` AST adapter.
- An executable first-party Axum capability for direct, unambiguous `use` bindings of `axum::Router` and `axum::routing::{get, post, put, patch, delete, head, options, trace}` (including direct aliases). A contiguous direct `Router::new().route("/path", method(handler))` builder chain with a literal path and one named top-level local handler now emits exact `framework.axum.direct-router.route.local-function` route evidence.
- Capability, discovery, CLI, unit, integration, source-search, dynamic/shadow/inline/composition/wrapper/rebinding/import-proof, and malformed-source coverage. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.36.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Rust facts and Axum routes reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v25`; the project resolver remains `project-resolver-v14` because the supported Rust and Axum forms are file-local. A pre-v0.36 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes the new facts.

### Deliberate limits

- Axum support accepts only direct non-public/non-wildcard `use` bindings, a direct unshadowed `Router::new()` root, contiguous literal `.route(...)` calls, one direct imported method-router helper, and one named top-level local function handler. `route_service`, `nest`, `merge`, `with_state`, `layer`, type/generic constructors, trailing wrappers, `MethodRouter` composition, inline/wrapped/namespaced handlers, dynamic/escaped paths, mutable/factory/router flow, methods, cross-file Cargo/module resolution, semantic type checking, and runtime behavior remain excluded.
- CodeGraph has materially broader Rust declaration, crate/module, and regex-based Axum/Actix/Rocket coverage. SymbolLattice v0.36 intentionally trades that breadth for auditable import, constructor, builder-chain, literal-path, local-handler, and shadowing proof in this first Rust slice.

## [0.35.0] - 2026-07-30

### Added

- An executable first-party Chi capability for direct non-dot/non-blank `github.com/go-chi/chi/v5` imports. Direct same-function `router := chi.NewRouter()` or `chi.NewMux()` receivers now emit exact route edges for `Get`, `Post`, `Put`, `Patch`, `Delete`, `Head`, `Options`, `Trace`, `Connect`, and `HandleFunc` with `framework.chi.direct-router.method.local-function` evidence.
- Additive `CONNECT` route-method support throughout the existing route symbol, query, CLI, and MCP contracts. Direct Chi `Connect("/path", handler)` routes and literal Go 1.22 `net/http` `"CONNECT /path"` `HandleFunc` patterns now remain exact route records instead of being rejected.
- Capability, unit, integration, dynamic/shadow/inline/wrapper/rebinding/composition-rejection, `CONNECT` filtering, and persisted route-query coverage. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.35.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. The additive `chi` capability and `CONNECT` method reuse existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v24`; the project resolver remains `project-resolver-v14` because all Chi and `net/http` proof remains file-local. A pre-v0.35 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes the new facts.

### Deliberate limits

- Chi support accepts only a direct `github.com/go-chi/chi/v5` import, a direct unshadowed same-function `:= chi.NewRouter()` or `chi.NewMux()` binding, a literal slash-prefixed path, and one named package-level function handler. `Route`/`Group`/`Mount` composition, `With` middleware chains, `Handle`, `Method`/`MethodFunc`, `Query`, inline/wrapped handlers, dynamic/escaped paths, `var`/factory/wrapper bindings, receiver methods, cross-file router flow, generic Go imports/calls/type resolution, Go module/package resolution, semantic type checking, and runtime behavior remain excluded.
- The new `CONNECT` value is deliberately limited to direct Chi `Connect` and literal `net/http` `HandleFunc` method patterns. It does not imply semantic HTTP validation, host/wildcard pattern support, or arbitrary user-defined method registration.

## [0.34.0] - 2026-07-30

### Added

- An executable first-party `net-http` capability for Go. Direct default-multiplexer `http.HandleFunc("/path", handler)` registrations now emit exact `ALL` route edges with `framework.net-http.default-serve-mux.handle-func.local-function` evidence.
- Same-function direct short-variable `mux := http.NewServeMux()` bindings and literal `mux.HandleFunc(...)` registrations, including the deliberate Go 1.22 `GET /path` / `POST /path` / `PUT` / `PATCH` / `DELETE` / `HEAD` / `OPTIONS` / `TRACE` pattern subset. These emit exact `framework.net-http.serve-mux.handle-func.local-function` evidence.
- Reusable exact Go import-alias extraction for the supported framework packs, plus capability, unit, integration, dynamic/shadow/wrapper/rebinding, method-pattern, and persisted route-query coverage. The standalone Traditional Chinese comparison report is at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.34.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. The additive `net-http` capability and exact Go syntax edges reuse the existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v23`; the project resolver remains `project-resolver-v14` because the supported `net/http` forms are file-local. A pre-v0.34 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes the new facts.

### Deliberate limits

- `net/http` support accepts only one direct non-dot/non-blank `net/http` import, a direct unshadowed `http.HandleFunc` or same-function `:= http.NewServeMux()` receiver, plain literal slash paths or the documented literal Go 1.22 method-pattern subset, and one named package-level function handler. `http.Handle`, `ServeMux.Handle`, `DefaultServeMux` member calls, `var`/factory/wrapper bindings, inline/wrapped handlers, dynamic/escaped/host/wildcard patterns, `CONNECT`, member handlers, cross-file receiver flow, generic Go imports/calls/type resolution, Go module/package resolution, semantic type checking, and runtime behavior remain excluded.
- Gin remains the direct engine / literal same-function `RouterGroup` slice from v0.33. chi, Echo, Fiber, additional standard-library registration forms, and broader Go resolution remain future work.

## [0.33.0] - 2026-07-30

### Added

- Go `.go` discovery, persisted language filters, and a `@lezer/go` AST adapter. Valid Go files now retain conservative file and top-level function containment facts; malformed source fails closed to its file symbol.
- An executable first-party Gin framework capability for direct `gin.Default()` / `gin.New()` short-variable receivers, direct uppercase HTTP methods plus `Any`, and named package-level handlers. Every accepted registration emits an exact `routes` edge with `framework.gin.direct-engine.method.local-function` evidence.
- Same-function literal `RouterGroup` composition, including nested group prefixes. Direct `group.GET("/users", handler)` registrations now project exact paths such as `GET /api/v1/users` with `framework.gin.direct-group.method.local-function` evidence.
- Capability, discovery, source-search language-validation, unit, integration, dynamic/shadow/rebinding, literal-prefix, malformed-source, and exact route-query coverage, plus a Traditional Chinese comparison report at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.33.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Go facts and Gin routes use existing file, symbol, edge, source-search, and route-query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v22`; the project resolver remains `project-resolver-v14` because this first Go slice emits only exact file-local syntax facts. A pre-v0.33 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes Go-capable facts.

### Deliberate limits

- Gin support accepts only a direct non-dot/non-blank import of `github.com/gin-gonic/gin`, a direct same-function `:=` engine binding, one named handler argument, static slash-prefixed paths, and literal non-root/non-trailing `Group` prefixes. `var` engine declarations, `Handle`, `Match`, static-file helpers, inline/multiple/middleware handlers, dynamic or escaped paths, group middleware, member/chained receivers, factory/wrapper construction, cross-file receiver flow, methods, and runtime configuration are intentionally excluded.
- `net/http`, chi, Echo, Fiber, generic Go imports/calls/type resolution, Go module/package resolution, semantic type checking, and runtime framework behavior are not modeled in v0.33.

## [0.32.0] - 2026-07-30

### Added

- An executable first-party Flask framework capability for Python, with AST-proven direct application `@app.get` / `post` / `put` / `patch` / `delete` routes and direct `@app.route("/...", methods=[...])` or tuple-method registrations. Literal unique uppercase methods emit independent exact route nodes and `framework.flask.direct-app.decorator.local-function` syntax evidence.
- Same-file literal Flask Blueprint composition: a direct `Blueprint(...)` binding with an optional literal `url_prefix`, direct top-level decorated local handlers, and a later direct `app.register_blueprint(blueprint, url_prefix="/...")` now project exact paths such as `GET /api/catalog/items` with `framework.flask.direct-blueprint.register-blueprint.decorator.local-function` evidence.
- Capability, unit, integration, route-query, alias, prefix-composition, dynamic-method/prefix, factory, and rebinding coverage, plus a Traditional Chinese comparison report at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.32.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Flask routes use the existing graph edge and route query contracts; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v21`; the project resolver remains `project-resolver-v14` because this Flask slice emits only direct same-file syntax evidence. A pre-v0.32 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes Flask-capable facts.

### Deliberate limits

- Cross-file Blueprints, `add_url_rule`, nested/factory Blueprints, custom route wrappers, dynamic methods or endpoints, star/keyword expansion, member receivers, runtime route configuration, middleware, and Flask request lifecycle behavior are intentionally excluded.
- Django, Starlette, generic Python import/export/call resolution, Python type hierarchy, semantic type checking, and runtime framework behavior are not modeled in v0.32.

## [0.31.0] - 2026-07-30

### Added

- Exact cross-file FastAPI `APIRouter` projection for one direct package-relative import: `from .routers.catalog import router [as local_router]`, followed by a direct literal `app.include_router(local_router, prefix="/...")`, now projects literal decorated routes from the router module into first-class route nodes such as `GET /api/catalog/health`.
- Additive persisted `fastApiRouterFacts` record final direct router declarations, their literal local-handler decorators, and direct relative inclusion facts independently from ordinary Python import/call resolution. A regular-package boundary is proven with `__init__.py` markers for the importing directory and each traversed child package.
- Exact `framework.fastapi.imported-router.include-router.decorator.local-function` module evidence, including the mounting and declaration file path. Unit, integration, persistence, and unsafe-boundary coverage verify aliases and reject absent package markers, parent-relative imports, import lists, dynamic/rebound shapes, and ambiguous module targets.
- A Traditional Chinese comparison report at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.31.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. The additive `fastApiRouterFacts` payload keeps prior generations readable while new generations retain auditable Python router-composition evidence.
- The artifact extractor advances to `multi-language-ast-v20` and the project resolver to `project-resolver-v14`. A pre-v0.31 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes cross-file FastAPI router facts.

### Deliberate limits

- The supported Python module surface is intentionally narrow: only a single-leading-dot, one-name relative import in a regular package is projected. Parent-relative/namespace/package-only imports, wildcard or multi-name imports, re-export chains, module members, nested routers, router aliases by assignment, factories/wrappers, and generic Python import/export/call resolution remain excluded.
- Flask, Django, Python type hierarchy, semantic type checking, and runtime framework behavior are not modeled in v0.31.

## [0.30.0] - 2026-07-30

### Added

- AST-proven same-file FastAPI `APIRouter` route composition. A direct one-line named import from `fastapi` may include `FastAPI` and `APIRouter` together (including direct import aliases); direct top-level `APIRouter(...)` construction, literal router prefixes, direct top-level decorated functions, and direct `app.include_router(router, prefix="/...")` calls now produce first-class exact route nodes such as `GET /api/catalog/items`.
- Exact `framework.fastapi.direct-router.include-router.decorator.local-function` syntax evidence for the composed route-to-handler edge. Existing direct application decorator evidence remains unchanged, while dynamic prefixes, star/keyword expansion, possible rebinding, unmounted routers, and routes declared after their inclusion are rejected instead of guessed.
- Capability, unit, integration, persistence, and route-query coverage for direct same-file router composition, plus a Traditional Chinese comparison report at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.30.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. The additive behavior stays in the existing Python artifact-fact and graph payloads; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v19`; the project resolver remains `project-resolver-v13`. A pre-v0.30 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes APIRouter-capable facts.

### Deliberate limits

- This remains a narrow, file-local FastAPI proof. Cross-file/module-member routers, nested routers, assignment aliases, factory wrappers, dynamic or escaped paths/prefixes, import-list continuations, and generic Python import/export/call resolution are intentionally excluded.
- Flask, Django, Python type hierarchy, semantic type checking, and runtime framework behavior are not modeled in v0.30.

## [0.29.0] - 2026-07-30

### Added

- Python `.py` discovery and a `@lezer/python` AST adapter. Valid Python files now emit conservative file, class, function, method, and exact `contains` facts; malformed source fails closed to its file symbol.
- A first Python framework pack for direct same-file FastAPI routes. A direct `from fastapi import FastAPI` import (with an optional alias), direct top-level application assignment, literal-path HTTP decorator, and top-level `def`/`async def` handler emit an exact `GET`/`POST`/`PUT`/`PATCH`/`DELETE`/`HEAD`/`OPTIONS`/`TRACE` route edge with `framework.fastapi.direct-app.decorator.local-function` syntax evidence.
- Python language filters through persisted source search, CLI, MCP, and Git source-path selection, plus extraction/persistence/incremental coverage and a Traditional Chinese comparison report at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.29.0.md`.

### Compatibility

- No SQLite schema migration or new query command is required. Python facts use the existing artifact-fact and graph payloads; existing generations remain readable.
- The artifact extractor advances to `multi-language-ast-v18`; the project resolver remains `project-resolver-v13`. A pre-v0.29 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes Python-capable facts.

### Deliberate limits

- This is a narrow, file-local FastAPI proof. `APIRouter`, `include_router`, cross-file Python imports, mixed import lists, factory composition, dynamic/multiline/escaped paths, and non-direct/rebound application shapes are intentionally excluded.
- Generic Python import/export/call resolution, type hierarchy, semantic type checking, and runtime framework behavior are not modeled in v0.29.

## [0.28.0] - 2026-07-30

### Added

- AST-proven React Router `createRoutesFromElements(...)` extraction for TypeScript/TSX and JavaScript/JSX. A direct non-type-only named import from `react-router` or `react-router-dom` (including an alias), one direct non-optional factory call, and exactly one direct JSX `Route` or JSX fragment argument now project first-class `NAVIGATE` routes.
- Factory-backed literal JSX trees reuse the established direct-child/fragment, relative-child, index-route, and pathless-layout composition rules. Every emitted page handler carries additive `routeRegistration: "react-router-create-routes-from-elements"` provenance and distinct `framework.react-router.create-routes-from-elements.*` evidence through the existing route, caller, impact, context, CLI, MCP, and retained-fact surfaces.
- Exact extraction, cross-file resolver, persisted-fact, caller, and incremental-reuse coverage for factory-specific route evidence, plus a standalone Traditional Chinese comparison report at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.28.0.md`.

### Compatibility

- No SQLite schema migration or new route-query command is required. Existing route symbols and facts remain readable; the new factory registration is an additive value in the existing optional `routeRegistration` contract.
- The artifact extractor advances to `typescript-ast-v17` and the project resolver to `project-resolver-v13`. A pre-v0.28 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes factory-specific facts and handler evidence.

### Deliberate limits

- This pack proves only the direct imported factory/call/argument/tree form. Type-only or shadowed imports, optional calls, additional arguments, dynamic JSX values, JSX conditions or arbitrary wrapper descendants, spread or duplicate attributes, dynamic paths, absolute child paths, and `.` / `..` child segments do not receive factory provenance.
- Unsupported factory calls are not silently reclassified as factory-backed navigation. Existing generic JSX `Route` extraction remains independently available when its own direct syntax proof applies.

## [0.27.0] - 2026-07-30

### Added

- Recursive, AST-proven React Router JSX route trees. Direct literal child `Route` elements, including direct JSX fragments, now compose relative child paths, index routes, and pathless layouts from a slash-prefixed root route into first-class `NAVIGATE` symbols.
- Nested JSX output preserves the existing exact local, imported, re-exported, and unresolved page-handler evidence with distinct `framework.react-router.jsx-route.*` rule IDs. v6 `Component` / `element` handlers can participate in recursive composition; an existing v5 `component` route remains a direct standalone proof and never projects child routes.
- A standalone v0.27 comparison report at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.27.0.md`, following the versioned workspace-root report convention.

### Compatibility

- No SQLite schema migration or new route-query command is required. Existing route symbols and facts remain readable; recursive JSX routes use the established `NAVIGATE`, route-framework, and edge-evidence contracts.
- The artifact extractor advances to `typescript-ast-v16`. A pre-v0.27 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes recursive JSX facts. The project resolver remains `project-resolver-v12` because handler resolution is unchanged.

### Deliberate limits

- This pack supports only direct literal JSX route children and direct fragments. Conditional expressions, arbitrary wrapper descendants, `createRoutesFromElements`, `basename`, dynamic paths, absolute child paths, `.` / `..` child segments, spread attributes, duplicate attributes, and runtime router configuration are not inferred.
- A pathless layout supplies URL context to supported children but is not emitted as a public navigation route. An index route must have no path or substantive JSX children. The legacy v5 `component` form stays supported for direct routes only because it cannot prove v6 nested-route semantics.

## [0.26.0] - 2026-07-30

### Added

- Recursive, AST-proven React Router v6.4+ data-router trees. Direct literal `children` arrays now compose relative child paths, index routes, and pathless layout traversal from an eligible slash-prefixed root route into first-class `NAVIGATE` route symbols.
- Existing local, imported, re-exported, and unresolved page-handler resolution remains intact for every emitted nested route. Nested output keeps `routeRegistration: "react-router-data-router"` and its distinct `framework.react-router.data-router.*` evidence.
- A versioned workspace-root comparison report at `C:\Users\win10\Desktop\Graph\FEATURE_COMPARISON_v0.26.0.md`, maintained outside the project checkout so it can compare the local SymbolLattice and CodeGraph checkouts side by side. Every later version creates its own `FEATURE_COMPARISON_vX.Y.Z.md` with verified capability, evidence, deliberate limits, and a plain-language assessment.

### Compatibility

- No SQLite schema migration or new route-query command is required. Existing route facts remain readable; nested routes use the existing `NAVIGATE`, route-framework, registration, and edge-evidence contracts.
- The artifact extractor advances to `typescript-ast-v15`. A pre-v0.26 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes recursive data-router facts. The project resolver remains `project-resolver-v12` because the existing handler-resolution semantics are unchanged.

### Deliberate limits

- This pack supports direct literal `children` arrays only. Dynamic child arrays, spreads, `lazy`, factory options or `basename`, nested JSX `Route` composition, route-array variables, absolute child paths, `.` / `..` child segments, and runtime router configuration are not inferred.
- A pathless layout can pass its parent's URL context to static children, but does not become a separate public navigation route itself. An index child must have no path or children; malformed children are excluded independently without removing a separately proven ancestor or sibling.

## [0.25.0] - 2026-07-30

### Added

- An executable first-party framework capability registry for Express, Fastify, NestJS, React Router, and Next.js. The AST extraction pipeline now selects registered passes by the parsed language, so framework coverage has one inspectable extension boundary rather than a documentation-only inventory.
- Syntax-proven Next.js Pages Router navigation from `pages/` and `src/pages/` files with a direct named default export. `index` files map to their containing path and dynamic path segments remain explicit route patterns such as `NAVIGATE /blog/[slug]`.
- Syntax-proven Next.js App Router navigation from `app/` and `src/app/` `page` files with a direct named default export. Conventional route groups are omitted from the URL, while ordinary local/import/re-export handler resolution produces `framework.nextjs.pages-router.*` or `framework.nextjs.app-router.*` evidence.
- Additive `routeFramework: "nextjs"` and `routeRegistration: "nextjs-pages-router" | "nextjs-app-router"` provenance, plus unit, resolution, persisted-fact, caller, and incremental-reuse coverage.

### Compatibility

- No SQLite schema migration or new route-query command is required. Existing raw artifact facts gain only additive route-framework and route-registration values; existing route symbols and evidence remain readable.
- The artifact extractor advances to `typescript-ast-v14` and the project resolver to `project-resolver-v12`. A pre-v0.25 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes capability and Next.js navigation evidence.

### Deliberate limits

- Next.js coverage is a static convention proof, not a runtime model. Pages API files, special Pages files, App Router `route` handlers, middleware, layouts, templates, loading/error/not-found files, anonymous/wrapped/HOC defaults, parallel routes, intercepting routes, and runtime configuration are excluded.
- App route groups are omitted only for conventional `(name)` segments. React Router nested/index/relative composition remains a later pack; this release does not widen the existing React Router data-router proof boundary.

## [0.24.0] - 2026-07-30

### Added

- AST-proven React Router v6.4+ data-router object routes for TypeScript/TSX and JavaScript/JSX. Direct non-type-only named `createBrowserRouter`, `createHashRouter`, and `createMemoryRouter` imports from `react-router` or `react-router-dom` (including aliases) now recognize a direct one-argument route array with slash-prefixed literal object paths and exactly one direct `Component: Page` or `element: <Page />` page handler.
- Additive `routeRegistration: "react-router-data-router"` fact provenance and `framework.react-router.data-router.*` terminal-handler evidence. Local, imported, re-exported, and unresolved page references retain the factory/object route shape through the existing route, caller, impact, context, CLI, and MCP views, while `NAVIGATE` remains an explicit client-navigation discriminator rather than an HTTP method.
- Exact type-only, lexical-shadow, factory-options, path, handler, spread, duplicate, computed-field, member-expression, and lazy-route rejection boundaries, plus persisted-fact and incremental-reuse coverage for a real data-router project.

### Compatibility

- No SQLite schema migration or new route-query command is required. The existing raw artifact-fact payload gains the additive optional `routeRegistration: "react-router-data-router"` value; existing route facts and evidence remain readable.
- The artifact extractor advances to `typescript-ast-v13` and the project resolver to `project-resolver-v11`. A pre-v0.24 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes data-router navigation evidence.

### Deliberate limits

- This pack scans only direct object entries in a literal first-argument route array. It does not compose `children`, derive index or relative paths, apply a `basename`/factory options object, infer lazy or runtime route modules, follow route-array variables/spreads, or interpret Next.js file-system routing. A direct `lazy` field is rejected because it can replace the rendered page at runtime.

## [0.23.0] - 2026-07-30

### Added

- AST-proven React Router JSX client-navigation routes for TypeScript/TSX and JavaScript/JSX. A direct non-type-only named `Route` import from `react-router` or `react-router-dom` now recognizes literal slash-prefixed `path` attributes paired with exactly one direct v5 `component`, v6 `Component`, or v6 `element={<Page />}` page reference.
- Explicit `NAVIGATE` route discriminator for client-side navigation. React Router records become first-class route symbols such as `NAVIGATE /settings`, retain ordinary `routes` edges to local, imported, re-exported, or unresolved page components, and remain queryable through the existing CLI, service, and MCP route views without being mislabeled as HTTP `GET` requests.
- Framework-specific `framework.react-router.jsx-route.*` evidence, including exact lexical/module/re-export provenance and unresolved component evidence. Route/import binding checks reject type-only, shadowed, spread, duplicate, member-expression, or runtime-shaped JSX registrations before they reach graph resolution.

### Compatibility

- No SQLite schema migration or new route-query command is required. `NAVIGATE` is an additive route-method value and `react-router` is an additive optional `routeFramework` provenance value in the existing raw artifact-fact payload; existing HTTP routes and persisted facts remain readable.
- The artifact extractor advances to `typescript-ast-v12` and the project resolver to `project-resolver-v10`. A pre-v0.23 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes React Router navigation evidence.

### Deliberate limits

- This pack supports JSX `<Route>` elements only. It excludes direct data-router route-object arrays passed to `createBrowserRouter`, `createHashRouter`, and similar APIs, plus lazy/wrapped/inline or member-expression page handlers, spreads, dynamic paths, nested-path composition, runtime router configuration, and Next.js file-system conventions. The `NAVIGATE` discriminator intentionally represents browser navigation rather than an HTTP method.

## [0.22.0] - 2026-07-30

### Added

- AST-proven cross-file Fastify plugin-prefix composition for TypeScript and JavaScript. A direct `app.register(importedPlugin, { prefix: "/..." })` root registration now resolves one value-space ESM import or re-export surface to an exported function or variable callback, projects literal source-plugin routes, and preserves the route declaration file.
- Nested source-plugin composition. An exported plugin can directly `register(childPlugin, { prefix: "/..." })` through an exact local, imported, or re-exported identifier; literal prefixes compose into ordinary route nodes such as `GET /api/users` and `TRACE /api/v1/jobs`. A repeated plugin in one active ancestry is not expanded again, keeping cyclic source registrations finite and deterministic.
- Additive `fastifyPluginFacts` raw artifact facts for source-plugin routes, child registrations, and imported root registrations, plus `routeRegistration: "fastify-imported-plugin-prefix"` and `framework.fastify.imported-plugin-prefix.*` terminal-handler evidence. Exact local, imported, re-exported, and unresolved handlers retain that provenance through the existing route/caller/impact/query surfaces.

### Compatibility

- No SQLite schema migration or new CLI/MCP command is required. The existing artifact-fact JSON stores the additive optional `fastifyPluginFacts` and imported-plugin route-registration provenance; old facts remain readable and retain their former evidence rules.
- The artifact extractor advances to `typescript-ast-v11` and the project resolver to `project-resolver-v9`. A pre-v0.22 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes cross-file Fastify plugin evidence.

### Deliberate limits

- Cross-file composition accepts only direct identifiers, exact value-space ESM import/re-export surfaces, direct function declarations or immutable direct function/arrow `const` callbacks, exactly two-argument `register` calls, and static slash-prefixed non-root/non-trailing prefix objects. It excludes CommonJS, namespace/member access, assignment aliases, type-only or ambiguous exports, mutable/wrapped (`fastify-plugin`) callbacks, computed/spread/duplicate registrations, and dynamic prefixes.
- Root routes inside any prefixed plugin remain excluded because Fastify `prefixTrailingSlash` can produce different concrete runtime paths. Hooks, schemas, custom methods, inline/member handlers, runtime route options, and runtime composition remain outside the static proof surface.

## [0.21.0] - 2026-07-30

### Added

- AST-proven same-file Fastify named-plugin prefix composition for TypeScript and JavaScript. A direct `register(plugin, { prefix: "/..." })` call can now establish a scoped Fastify receiver when `plugin` resolves lexically to either a direct non-generator function declaration with no direct rebinding or an immutable `const` initialized by a direct function/arrow expression.
- Nested static composition across those named local callbacks and existing direct inline callbacks. A local `api` plugin that registers a local `v1` plugin produces ordinary first-class paths such as `GET /api/users` and `TRACE /api/v1/jobs`, with the same bounded read-only route graph surface as v0.20.
- Additive `routeRegistration: "fastify-local-plugin-prefix"` raw-fact provenance and `framework.fastify.local-plugin-prefix.*` handler evidence. Local, imported, re-exported, and unresolved terminal handlers retain the local-plugin prefix proof through project resolution.

### Compatibility

- No SQLite schema migration or new CLI/MCP command is required. The existing raw artifact-fact JSON gains one optional route-registration value; pre-v0.21 facts remain readable and retain their existing rule IDs.
- The artifact extractor advances to `typescript-ast-v10` and the project resolver to `project-resolver-v8`. A pre-v0.21 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes named-plugin route evidence.

### Deliberate limits

- A local plugin must be in the same file and passed as the direct first argument of a direct `register` call. Accepted local definitions are direct function declarations with no direct rebinding, or direct function/arrow initializers of immutable `const` bindings. The callback still needs an identifier first receiver parameter with no lexical reassignment and the registration still needs exactly two arguments plus a literal slash-prefixed, non-root, non-trailing `prefix` object.
- To avoid choosing one incomplete path surface, a local callback is excluded when its exact lexical binding is passed to more than one direct `.register(...)` call anywhere in the same source file. Imported/re-exported/aliased/wrapped (`fastify-plugin`), mutable, member, dynamic, computed, spread, duplicate, or otherwise ambiguous plugin registrations remain outside this release. Prefixed-plugin root routes remain excluded because `prefixTrailingSlash` can change Fastify's concrete runtime paths.

## [0.20.0] - 2026-07-30

### Added

- AST-proven Fastify inline-plugin prefix composition for TypeScript and JavaScript. A direct inline function or arrow callback passed to a direct `server.register(callback, { prefix: "/..." })` call now establishes a scoped Fastify receiver, so its shorthand and full-object routes become first-class paths such as `GET /api/users`.
- Nested direct inline registrations compose their literal non-trailing prefixes before route extraction. `app.register(api => api.register(v1 => v1.route(...), { prefix: "/v1" }), { prefix: "/api" })` produces the same bounded read-only route graph surface as an ordinary Fastify route, including `TRACE` and multi-method full objects.
- Additive `routeRegistration: "fastify-inline-plugin-prefix"` raw-fact provenance and `framework.fastify.inline-plugin-prefix.*` handler evidence. Local, imported, re-exported, and unresolved handlers retain the route's plugin-prefix proof instead of being reported as an unqualified registration.

### Compatibility

- No SQLite schema migration or new CLI/MCP command is required. The existing raw artifact-fact JSON gains one optional route-registration field; existing Fastify and Express facts remain readable and retain their prior evidence rules.
- The artifact extractor advances to `typescript-ast-v9` and the project resolver to `project-resolver-v7`. A pre-v0.20 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes inline-plugin route evidence.

### Deliberate limits

- Prefix composition accepts only a direct, non-optional `register` call on a proven Fastify receiver, with a direct non-generator inline callback, an identifier first parameter that is not reassigned in its lexical body, exactly two arguments, and a direct object-literal slash-prefixed non-root/non-trailing `prefix`. Named, imported, re-exported, wrapped (`fastify-plugin`), mutable, aliased, dynamic, computed, spread, duplicate, or otherwise ambiguous plugin registrations remain outside this release.
- Root routes inside prefixed plugins remain excluded because Fastify's runtime `prefixTrailingSlash` setting can register different concrete path surfaces. Direct root routes without a plugin prefix remain supported by the v0.19 pack.

## [0.19.0] - 2026-07-30

### Added

- AST-proven Fastify HTTP routes for TypeScript and JavaScript. A direct non-type-only default import from `fastify`, a lexical unshadowed immutable `const server = Fastify(...)` receiver, a literal slash-prefixed path, and a direct identifier handler now create first-class `route` symbols and `routes` edges.
- Fastify shorthand registrations for `get`, `head`, `trace`, `delete`, `options`, `patch`, `put`, `post`, and `all`, plus direct `server.route({ method, url | path, handler })` objects. Full objects accept one uppercase method or a nonempty duplicate-free static method array, with either explicit `handler: name` or `{ handler }` shorthand; `url` and its documented `path` alias remain mutually exclusive.
- Framework-specific pending-route provenance and `framework.fastify.static-route.*` resolver evidence for local, imported, re-exported, and unresolved handlers. Fastify routes reuse the existing bounded read-only `routes` CLI, service, and MCP views; `TRACE` is now an accepted route filter across those views.

### Compatibility

- No SQLite schema migration is required. The additive optional `routeFramework` field lives in existing raw artifact-fact storage, while existing Express facts without it retain their `framework.express.literal-route.*` evidence on resolution.
- The artifact extractor advances to `typescript-ast-v8` and the project resolver advances to `project-resolver-v6`. A pre-v0.19 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes Fastify route evidence. Route handlers now require value-space lexical/import/re-export proof, so a type-only import or re-export is never promoted into a runtime handler edge.

### Deliberate limits

- This is a static Fastify route surface, not runtime framework execution. It excludes CommonJS, namespace/named-default factories, mutable or aliased receivers, `register(..., { prefix })` composition, hooks, schema interpretation, custom methods, dynamic method/path/handler values, inline or member handlers, and nonliteral paths or methods. A shorthand options slot can be present but is not interpreted.
- A Fastify full-route object must be a direct object literal with direct `method`, exactly one of `url` or `path`, and a direct identifier `handler`. Computed, spread, duplicate, conflicting, dynamic, or ambiguous shapes are intentionally not promoted into graph facts.

## [0.18.0] - 2026-07-30

### Added

- AST-proven NestJS non-HTTP entrypoints for TypeScript and JavaScript. Direct non-type-only named imports (including aliases) now recognize GraphQL `@Resolver` plus `@Query` / `@Mutation` / `@Subscription`, microservice `@Controller` plus `@MessagePattern` / `@EventPattern`, and `@WebSocketGateway` plus `@SubscribeMessage`.
- First-class `entrypoint` graph symbols and exact `handles` edges. They retain transport (`graphql`, `microservice`, or `websocket`), operation, and literal operation name/pattern/namespace-qualified event without pretending that non-HTTP dispatch is an HTTP route. The edges participate in callers, callees, impact, context, exploration, node retrieval, and edge explanation.
- Bounded read-only `entrypoints [path]` CLI command, `SymbolLatticeService.entrypoints`, and capability-gated `symbol_lattice_entrypoints` MCP tool. They expose transport, operation, and exact name-prefix filters with live freshness and explicit truncation while never initializing, indexing, or synchronizing a project.
- Static GraphQL name derivation from a handler name, direct schema-first literal name, or static `{ name: "..." }` option; recursive static JSON-compatible microservice object patterns with canonicalized keys; and static WebSocket gateway namespace composition.

### Compatibility

- No SQLite schema migration is required. Existing graph, artifact-fact, edge, and retained-snapshot storage persist the additive symbols and edges; existing generations remain readable.
- The artifact extractor advances to `typescript-ast-v7`. A pre-v0.18 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes entrypoint evidence. The project resolver remains `project-resolver-v5` because these edges are exact file-local syntax evidence.
- The `entrypoints` MCP tool is additive and capability-gated, so explore-only or route-only embedded services retain their existing tool lists.

### Deliberate limits

- SymbolLattice does not execute Nest, build a GraphQL schema, connect to a broker, inspect WebSocket runtime adapters, or infer a runtime transport. It recognizes only direct AST bindings and decorated instance methods with a body.
- Namespace imports, local decorator barrels, custom/composed decorators, type-only/foreign/shadowed imports, dynamic or conflicting GraphQL names, dynamic/prototype-setter microservice patterns, dynamic gateway namespace/event configuration, GraphQL field resolvers, and runtime guards/adapters remain outside the proof surface.

## [0.17.0] - 2026-07-30

### Added

- AST-proven NestJS `RouterModule.register([...])` module-prefix composition for TypeScript and JavaScript. A direct named `RouterModule` import from `@nestjs/core`, a direct named `@Module` import from `@nestjs/common`, literal route-object paths, and direct module identifiers now project controller-local HTTP routes through statically registered prefixes.
- Recursive `children` route trees, import aliases, and exact local/import/re-export class bindings. A route under `{ path: "admin", module: AdminModule, children: [{ path: "catalog", module: CatsModule }] }` becomes `/admin/catalog/...` when the controller is statically registered in `CatsModule`.
- Persisted syntax facts for route-to-controller, module-to-controller, and RouterModule-prefix relationships. The project resolver derives a full route symbol and an exact `routes` edge with `framework.nestjs.router-module.exact-prefix` module evidence; the existing CLI, MCP, callers, callees, context, and route views receive the projected route without a new public command.

### Compatibility

- No SQLite schema migration or public query contract change is required. The existing raw artifact-fact JSON payload carries the additive RouterModule facts, and existing generations remain readable.
- The artifact extractor advances to `typescript-ast-v6` and the project resolver advances to `project-resolver-v5`. A pre-v0.17 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes complete Nest module-prefix evidence.

### Deliberate limits

- This supports only direct `RouterModule.register([...])` expressions in a direct `@Module({ imports: [...] })` array. `forRoot` / `forChild`, variables, factories, CommonJS, local decorator barrels, namespace calls, custom wrappers, computed/spread/duplicate route-object properties, nonliteral paths, non-identifier modules, and dynamic children are deliberately excluded.
- A controller-local route is retained when its module prefix is missing, dynamic, ambiguous, or otherwise unproven. SymbolLattice adds no guessed global prefix, versioning, runtime adapter, guard, GraphQL, microservice, WebSocket, or SSE behavior.

## [0.16.0] - 2026-07-30

### Added

- AST-proven NestJS HTTP controller extraction for TypeScript and JavaScript: direct `@Controller(...)` plus `@Get`, `@Post`, `@Put`, `@Patch`, `@Delete`, `@Head`, `@Options`, or `@All` method decorators create persisted `route` symbols with joined controller/method paths.
- Direct exact `routes` edges from each Nest route to its decorated instance method. They carry `framework.nestjs.decorator-route.local-method` syntax evidence and participate in existing callers, callees, impact, context, exploration, edge explanation, CLI, and MCP route views without a name-resolution fallback.
- Exact decorator-import proof for non-type-only named imports from `@nestjs/common`, including import aliases. The extractor rejects shadowed, namespace, foreign-module, dynamic, object, custom, static, and body-less method shapes instead of manufacturing route evidence.

### Compatibility

- No SQLite schema migration or public query contract change is required. Existing graph, artifact-fact, edge, and retained-snapshot storage persists the additive Nest route shape; existing generations remain readable.
- The artifact extractor advances to `typescript-ast-v5`, so a pre-v0.16 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes Nest route evidence. The project resolver remains at `project-resolver-v4` because Nest routes are direct syntax edges, not a new cross-file resolution rule.

### Deliberate limits

- This is the direct NestJS HTTP controller surface, not a general Nest runtime model. It excludes local decorator barrels/re-exports, namespace or custom/composed decorators, literal arrays and object options, dynamic arguments, static/abstract handlers, RouterModule/global/version prefixes, guards, GraphQL, microservices, WebSockets, and SSE.
- Decorator recognition is never inferred from a filename, package manifest, or an unbound identifier. A route needs an AST-proven direct named import from `@nestjs/common`, one supported controller decorator, one supported method decorator, and an indexed method declaration in the same class.

## [0.15.0] - 2026-07-30

### Added

- AST-proven direct declaration hierarchy facts: TypeScript and JavaScript class `extends`, TypeScript class `implements`, and TypeScript interface `extends`. Direct identifiers with generic arguments are retained with exact source ranges; qualified names, mixin/call expressions, intersections, arrays, and other complex heritage expressions remain outside the proof surface.
- First-class `extends` and `implements` graph edges, direct parent/child graph helpers, and persistent unresolved-parent evidence. Heritage uses separate TypeScript value/type namespaces: class bases require a value-space class proof, while interfaces and implemented contracts use type-space class/interface/type-alias targets. Type-only imports and type-only re-export provenance are honored only where valid.
- Read-only `hierarchy <reference> [--limit]` CLI command, `SymbolLatticeService.hierarchy`, and capability-gated `symbol_lattice_hierarchy` MCP tool. They return bounded direct parents and exact children from the active generation, disclose parent/child truncation independently, and never initialize, synchronize, or mutate an index.

### Compatibility

- No SQLite schema migration is required. Existing graph, artifact-fact, edge, pending-reference, and retained-snapshot storage carry the additive hierarchy shape; existing generations remain readable.
- Extractor and resolver versions advance because raw facts now preserve value/type binding namespaces and type-only import/re-export markers. A pre-v0.15 active index reports `indexer-version-changed` until an explicit `sync` or `index` republishes hierarchy evidence. Explore-only MCP embeddings retain their tool list because hierarchy is capability-gated.
- Existing callers, callees, reverse impact, affected-test, route, context, and ordinary call-resolution semantics deliberately remain unchanged; hierarchy is its own direct declaration query.

### Deliberate limits

- This is direct syntax evidence, not a semantic TypeScript checker. SymbolLattice does not infer declaration merging, structural type validity, transitive ancestry, overrides, or dynamic/mixin/qualified heritage expressions.
- An unproven, incompatible, ambiguous, or explicitly type-only runtime base remains `unresolved`. SymbolLattice never promotes a project-wide matching name into an inheritance proof.
- Named class/interface declarations and default-exported class expressions are in scope; variable-held and nested class expressions do not yet become independent hierarchy nodes.

## [0.14.0] - 2026-07-30

### Added

- Evidence-first Express static-route extraction for a deliberately narrow, AST-proven surface: supported immutable `const` receivers from `express()` / `express.Router()` / `Router()`, slash-prefixed string-literal paths, supported HTTP verbs, and identifier-only middleware chains with a terminal named handler.
- First-class `route` graph nodes and `routes` edges. Exact handler bindings carry framework-specific evidence; unresolved or ambiguous handlers remain inspectable route edges instead of becoming guessed links. Route bindings participate in callers, callees, reverse impact, context evidence paths, and ordinary graph inspection with their distinct edge kind preserved.
- Read-only `routes [path]` CLI command and conditional `symbol_lattice_routes` MCP tool. Both provide bounded method/path filters, handler evidence, freshness, and explicit truncation without initializing, synchronizing, or mutating an index.

### Compatibility

- No SQLite schema migration is required: the existing text-backed symbol, edge, pending-reference, and retained-snapshot storage persists the additive route graph shape. Existing generations remain readable.
- The extractor and resolver versions advance so a pre-v0.14 active index reports `indexer-version-changed` until an explicit `sync` or `index` publishes route evidence. Explore-only embedded MCP services retain their prior tool list because `symbol_lattice_routes` is capability-gated.

### Deliberate limits

- This is not a general Express runtime model. It excludes CommonJS `require`, mutable or unknown receiver aliases, `app.use` mounts, chained `.route()`, computed methods, nonliteral or non-slash paths, property/namespace handlers, inline callbacks, arrays/spreads, and dynamic dispatch.
- SymbolLattice does not read `node_modules` or infer Express from a filename, package manifest, or receiver spelling. A supported route must have a local AST proof of its Express import and receiver origin.

## [0.13.0] - 2026-07-30

### Added

- Read-only `node <reference>` CLI command for an exact, generation-bound declaration view. It returns the persisted declaration range when available, direct callers/callees, live freshness, source provenance, and explicit output bounds without initializing or refreshing an index.
- Read-only, idempotent `symbol_lattice_node` MCP tool when an embedding supplies the optional node capability. Existing explore-only embeddings retain their prior MCP surface.
- Explicit node bounds in every result: at most 200 persisted declaration lines, 16,000 UTF-16 code units, 25 direct callers, 25 direct callees, and 25 ambiguous match candidates. Source, relation, and ambiguity truncation are separately disclosed.

### Compatibility

- No SQLite migration or index backfill is required. `node` reuses the existing optional active source-document projection, and existing `explore`, context, history, Git, watch, CLI, and MCP contracts remain unchanged.
- An exact node stays graph-queryable when an older adapter or legacy generation cannot provide persisted source documents. It reports `sourceAvailability: "unavailable"` with `source: null` rather than reading current filesystem text.

### Deliberate limits

- `node` returns source and relationships only for an exact ID, qualified-name, simple-name, or location match. Ambiguous and missing references preserve their match state without selecting a candidate or inventing evidence.
- Source text is an immutable active-generation declaration range. It is not a live-file reader, retained-generation source browser, transitive impact query, dynamic-dispatch analysis, or semantic code explanation.

## [0.12.0] - 2026-07-30

### Added

- Read-only `git-hunks [path] --base <ref> [--limit <count>]` CLI command for immutable local Git hunk declaration attribution. It resolves the local `merge-base(<ref>, HEAD)`, compares that revision with `HEAD`, returns zero-context unified hunks, and extracts declaration anchors separately from the exact old and new revision blobs.
- Read-only, idempotent `symbol_lattice_git_hunks` MCP tool when an embedding supplies the optional Git hunk capability. It preserves the MCP surface of existing explore-only and Git-change-set-only embeddings.
- Explicit immutable Git hunk bounds: at most 50 supported source files, a global hunk-record default of 25 and maximum of 100, and up to 25 declaration anchors for each old or new hunk side.

### Compatibility

- No SQLite migration, active graph, graph refresh, or index backfill is required. The feature reads local immutable Git blobs directly; existing graph, affected-test, retained-history, watch, CLI, and MCP contracts remain unchanged.
- `affected --base <ref>` remains the graph-backed, file-level affected-test selector. `git-hunks` is a separate revision-local source-attribution query and does not select tests.

### Deliberate limits

- Only the resolved local merge base and `HEAD` participate. The command and MCP tool do not select working-tree, staged, or untracked files; they never fetch, index, synchronize, or mutate Git or SQLite state.
- Declaration anchors and IDs are revision-local evidence. The release makes no rename, move, old/new identity, or cross-side continuity claim.
- Attribution is limited to supported TypeScript/JavaScript source sides and zero-context unified hunks. A selection above the 50-source-file cap is rejected rather than silently truncated.

## [0.11.0] - 2026-07-30

### Added

- Immutable retained graph snapshots for up to five SymbolLattice generations, including the active generation. Each retained summary records captured graph counts, index-work telemetry when available, extractor/resolver versions, and the immutable snapshot-payload version.
- Read-only `history [path]` and `diff <from-generation-id> [path]` CLI commands. `history` returns newest-first retained summaries and explicit retention/request bounds; `diff` compares retained graph snapshots with independently bounded added, removed, and modified file, symbol, edge, and pending-reference sections.
- Read-only, idempotent `symbol_lattice_history` and `symbol_lattice_diff` MCP tools when a compatible service capability is present. Both preserve the tool surface of older explore-only embeddings.
- Explicit `activeStatus` on history/diff responses. It reports the live-filesystem freshness of the current active generation without claiming freshness for an older immutable snapshot.
- Additive `generation_snapshots` SQLite storage with active v2-v4 projection backfill on explicit initialization, deterministic retention pruning, manual FTS cleanup before generation deletion, and rollback-safe pointer-last replacement.

### Compatibility

- SQLite metadata remains at marker `4` so a v0.10 binary can still open and explicitly reindex after a rollback. The retained snapshot table is additive; an explicit `sync`, `index`, or `init` repairs/backfills a v2-v4 active generation without fabricating a v1 generation ID.
- `history` and `diff` are strictly read-only. A legacy active generation without a saved immutable snapshot, or an older external `GraphStore` adapter without the optional capability, returns `GENERATION_HISTORY_UNAVAILABLE` instead of changing storage during a query.
- Evicted, unknown, invalid, and same-generation comparisons report explicit generation errors. Existing graph, source-search, context, affected-test, watch, CLI, and MCP contracts remain unchanged.

### Deliberate limits

- This release compares retained **graph snapshots**, not Git commits, source hunks, historical source text, rename/move intent, or hunk-to-symbol attribution.
- A stable graph ID with a changed persisted payload is reported as `modified`; without a stable identity, a change remains remove-plus-add rather than an inferred move or rename.

## [0.10.0] - 2026-07-30

### Added

- Bounded pending-file disclosure in the native foreground `watch [path]` NDJSON stream. `event-pending` reports a lexically ordered sample of up to 25 project-relative paths, explicit unknown/overflow semantics, and retains the disclosure through failed status or sync work.
- `event-fresh` receipt for an event-associated reconciliation that finds no drift. A successful `event-fresh` or `synced` receipt clears the pending state only when no newer event arrived during that reconciliation.
- Native watcher path hygiene: Windows separators normalize to forward slashes; absolute, traversal, ambiguous, or missing filenames still invalidate safely but are disclosed as unknown rather than leaking host paths. Hard-excluded directories stay invisible.

### Compatibility

- No SQLite migration, daemon, MCP mutation, or cross-process state is added. `WatchEventSource` retains source compatibility because event callbacks may still be invoked without a path.
- `WatchReceipt` now always includes `pendingFileCount`, `pendingFiles`, `pendingFilesTruncated`, and `pendingFilesUnknown`. TypeScript integrations that construct that public type must add the four fields; consumers should treat a `null` count as intentionally non-exact rather than as zero.

### Deliberate limits

- Pending paths exist only in the foreground watch process that observed native events. SymbolLattice does not yet persist them, expose an MCP per-query warning/banner, coordinate multiple watchers, or claim daemon-level freshness.
- The disclosure is a scheduling and safety signal, not a per-file partial resolver: every reconciliation still evaluates complete live index freshness before publishing.

## [0.9.0] - 2026-07-30

### Added

- Native filesystem-event acceleration for the explicit foreground `watch [path]` command. The CLI subscribes recursively when the host supports it, debounces event bursts for 250 ms, filters the same hard-excluded directories as source discovery, and always reuses the established `getStatus` then atomic `sync` path.
- The existing bounded polling cadence now remains a safety sweep. Native watcher setup or runtime failure emits a compact `event-watch-failed` NDJSON receipt with `WATCH_EVENTS_UNAVAILABLE` or `WATCH_EVENTS_FAILED`, closes the event source, and continues polling instead of silently losing freshness checks.
- `event-watch-active` NDJSON receipt, deterministic event-burst/coalescing/cleanup coverage, and a testable Node `fs.watch` adapter. `watch --poll` explicitly disables native event acceleration for controlled environments.

### Compatibility

- No SQLite migration is required. `WatchEventSource` is optional: existing application embeddings that call `startForegroundWatch` without one retain v0.8 polling behavior, while the CLI supplies the native adapter by default.
- The foreground process, persisted scope, atomic publication, force guard, retry/backoff, signal handling, and read-only MCP boundary are unchanged. No daemon or MCP mutation surface was added.

### Deliberate limits

- Native events are a scheduling hint, not a per-file semantic incremental resolver. A reconciliation still scans the complete live catalog and can rebuild the full project projection when required.
- SymbolLattice does not provide a daemon, durable background watch, cross-process coordination, CodeGraph-style pending-file banners, historical graph generations, semantic Git diff, or hunk-to-declaration attribution in this release.

## [0.8.0] - 2026-07-30

### Added

- Explicit foreground `watch [path]` command for an existing index. It performs the same live freshness check as `status`, runs the established atomic `sync` only when drift is detected, and preserves the active generation when a refresh fails.
- Compact, stable NDJSON lifecycle receipts: `started`, `stale-detected`, `synced`, `sync-failed`, `status-failed`, and `stopped`. Each record keeps generation IDs, current status, index-work telemetry, actionable errors, and an explicit retry delay.
- Bounded polling interval validation (`250-60000` ms; default `2000`), non-overlapping recursive scheduling, exponential retry/backoff, fail-fast handling when an active index disappears, and graceful `SIGINT`/`SIGTERM` shutdown that waits for an in-flight sync to finish.
- Deterministic lifecycle, retry, no-overlap, shutdown, CLI-output, and real filesystem-sync tests.

### Compatibility

- No SQLite migration is required. `watch` is a CLI-only lifecycle around existing `getStatus` and `sync` semantics; it does not replace persisted scope, alter ordinary command output, or add an MCP mutation surface.
- Existing MCP tools remain read-only and never start, control, or wait for a watch session. Existing `affected` and Git-affected result contracts are unchanged.

### Deliberate limits

- `watch` is foreground polling, not a daemon, native filesystem-event watcher, cross-process coordinator, or background service. It scans the project catalog every interval and stops when its terminal process exits.
- It requires an initialized project and never runs `init` automatically. `--scope` is intentionally unavailable so a watcher cannot silently replace the active generation's stored scope.

## [0.7.0] - 2026-07-30

### Added

- Local Git-aware affected-test selection through `affected --working-tree` and `affected --base <ref>`. Working-tree mode compares `HEAD` with staged and unstaged work plus untracked files; base mode compares the local `merge-base(<ref>, HEAD)` with `HEAD` and never fetches.
- A small `GitChangeSetProvider` port and native `FileSystemGitChangeSetProvider` adapter. The adapter uses argv-only `execFile`, `--no-ext-diff`, `--no-textconv`, NUL-delimited output parsing, bounded command execution, and project-relative path validation.
- Immutable `changeSet` provenance for requested base, merge base, HEAD, untracked inclusion, deterministic Git records, rename/copy scores, and selected source paths. Both sides of a rename or copy remain visible to the active-generation graph query.
- Read-only, idempotent `symbol_lattice_affected_git` MCP tool when a Git-aware service capability is configured; existing MCP and explicit-path affected-test surfaces remain unchanged.

### Compatibility

- No SQLite migration is required. Existing graph queries and explicit-path `affected` behavior are unchanged.
- Older embedded services can omit the optional `GitChangeSetProvider`; they retain their existing MCP tool surface instead of exposing a partially configured Git tool.

### Deliberate limits

- Git selection is local file-level selection, not semantic Git diff, hunk-to-symbol mapping, runtime analysis, or test-runner discovery.
- Only supported TypeScript/JavaScript paths outside hard-excluded directories enter graph analysis. A Git change set with no such paths returns provenance with `affected: null`; more than 50 source paths fails explicitly rather than truncating.

## [0.6.0] - 2026-07-29

### Added

- `affected [filePaths...]` CLI command with Git-friendly `--stdin`, bounded `--depth` and `--limit`, project-relative/absolute path normalization, and stable JSON output.
- `SymbolLatticeService.affectedTests(projectPath, filePaths, options)` for changed-file test selection from the active graph generation.
- Read-only, idempotent `symbol_lattice_affected` MCP tool with capability detection, preserving the tool list of older explore-only embeddings.
- Deterministic affected-test evidence paths through exact persisted `imports` and `exports` edges, including barrel re-exports. A changed conventionally named test file is returned with a zero-edge `changed-test` proof.
- Shared conservative test-path classification for `*.test.*`, `*.spec.*`, `*.e2e.*`, and conventional test directories.
- Explicit analysis bounds and completeness reporting: indexed versus unindexed inputs, active index scope, stale index state, depth, visited-file, and result-limit omissions.

### Compatibility

- No SQLite migration is required. `affected` reads the active graph bundle only and remains compatible with older GraphStore adapters.
- Older adapters that do not persist index inputs return `indexScope: null`; the feature does not fabricate scope or source provenance.

### Deliberate limits

- `affected` is changed-file static analysis, not Git semantic diff or test-runner discovery. Git is an explicit caller-owned pipeline integration.
- Only exact persisted file-level import/export edges count as proof. Dynamic dispatch, runtime test discovery, unindexed paths, unsupported languages, and omitted traversal branches are surfaced as limitations rather than treated as safe.

## [0.5.0] - 2026-07-29

### Added

- `context <reference...>` CLI command for 1–8 ordered symbol references, with explicit caps for direct relationships, static proof hops, reverse-impact depth, and reverse-impact paths.
- Read-only, idempotent `symbol_lattice_context` MCP tool with structured output and capability detection, so existing explore-only embeddings retain their previous tool surface.
- Generation-bound multi-symbol context records: each reference preserves its `exact`, `ambiguous`, or `not_found` resolution, and exact records carry persisted source when available plus bounded callers, callees, and reverse impact. Ambiguous candidate lists are capped with an explicit truncation flag.
- Deterministic shortest directed evidence paths for adjacent exact references. Paths follow only exact resolved `calls` and `imports` edges, retain their original edge evidence, and report `no-path`, `not-applicable`, or traversal truncation explicitly when appropriate.
- An additive `impact` options overload and `impact --limit` CLI flag. Explicit limits return the deterministic path prefix together with `truncated`; existing unbounded impact responses keep their prior JSON shape.

### Compatibility

- No SQLite metadata or table migration is required. `context` reuses the v0.4.1 optional active-generation source-document bundle.
- Older GraphStore adapters and legacy generations remain graph-queryable. Exact context records use `source: null` with `sourceAvailability: "unavailable"` when persisted source cannot be supplied; they never fall back to live filesystem content.

### Deliberate limits

- Context references are explicit rather than natural-language retrieval. Evidence paths do not reverse edges, promote heuristic edges to proof, invent dynamic dispatch, or cross unsupported language/framework boundaries.

## [0.4.1] - 2026-07-29

### Fixed

- Exact `explore` responses now take their source excerpt from the same persisted active generation as the graph, relationships, and ranges. Changed or deleted live files can no longer be mixed with older graph evidence.

### Added

- The bundled `SymbolLatticeService` now returns additive `explore.sourceAvailability` to distinguish immutable `active-generation` source evidence from `unavailable` legacy/retrieval states and `not-applicable` non-exact matches; legacy external embeddings may omit it without inventing provenance.
- An optional, backward-compatible GraphStore source-document bundle read for exact generation-bound source evidence.

### Compatibility

- No SQLite metadata or table migration is required. Older GraphStore adapters and active generations remain graph-queryable; when they cannot provide persisted source text, `explore` returns `source: null` with `sourceAvailability: "unavailable"` instead of reading the live filesystem.

## [0.4.0] - 2026-07-29

### Added

- Generation-bound local FTS5 source retrieval across persisted TypeScript/TSX/JavaScript/JSX source text and identifier parts.
- `search <query>` CLI command with bounded `--limit`, project-relative `--path`, and `--language` filters.
- Persisted source hit evidence: deterministic rank, range, excerpt, direct source terms, lexical explanation, and overlapping symbol candidates.
- Read-only, idempotent `symbol_lattice_search` MCP tool with structured output; `symbol_lattice_explore` now also exposes structured output.
- Additive source-retrieval tables for source documents and a versioned FTS projection, committed atomically with the active graph generation under the SQLite v4 metadata marker.
- A `prepack` build gate so packaged artifacts always regenerate `dist` from the current source.

### Changed

- Query-only graph reads now load a lightweight active graph bundle instead of raw artifacts.
- `sync` treats a missing or outdated source-search projection as an explicit indexer-version change and can backfill it while reusing compatible raw facts.
- Search freshness is evaluated against the current project while every result excerpt and range remains bound to the persisted active generation.
- Existing v0.3 `GraphStore` adapters retain ordinary graph reads; source search stays explicitly unavailable until an adapter opts into the new retrieval capability.

### Upgrade notes

- SQLite v1-v4 indexes remain readable. The additive retrieval tables keep a v4 metadata marker so a v0.3 binary can still open and reindex after a rollback. A legacy active generation intentionally has no source-search projection; run `sync` or `index` before using `search`.
- The v0.4 source-search backfill reuses compatible v0.3 raw artifacts when safe. It never fabricates historical source evidence or index-work data.

### Deliberate limits

- Retrieval is local lexical FTS only. Embeddings, cloud search, semantic ranking, multi-symbol context assembly, and historical source browsing remain out of scope.

## [0.3.0] - 2026-07-29

### Added

- Local workspace package resolution from root `package.json` workspaces arrays or objects, including recursive/excluded patterns, root entries, explicit subpath exports, and safe entrypoint fallbacks.
- Workspace manifest tracking in the active generation fingerprint; duplicate names, malformed manifests, escaping entries, and out-of-scope targets now fail explicitly instead of guessing.
- TypeScript AST facts for named, wildcard, default-through-named, and namespace re-export syntax.
- Deterministic re-export export surfaces for multi-hop barrels, explicit-over-wildcard precedence, wildcard collision safety, cycle termination, and re-export route evidence.
- Incremental `sync` raw-artifact reuse based on file path, content hash, language, and extractor version.
- Reverse import/re-export dependency invalidation telemetry through persisted `lastIndexWork`; no-op sync does not publish a new generation.
- SQLite schema v4 with generation-bound index-work records and an atomic active-generation bundle read.

### Changed

- `sync` now rebuilds the complete cross-file projection from current raw facts after incremental extraction, preserving correctness for new exports, removals, aliases, barrels, and manifest changes.
- Project freshness now recognizes `indexer-version-changed` and treats the root and discovered workspace manifests as reproducibility inputs.
- Re-exported exact calls use `module.reexported-import-binding` evidence with a project-relative resolution path.
- Persisted v1-v3 raw facts missing re-export data are normalized at the storage boundary but cannot be reused until a compatible v0.3 extraction succeeds.

### Deliberate limits

- pnpm workspace YAML, watcher/daemon sync, namespace property dispatch, CommonJS `require`, and external dependency indexing remain out of scope.

## [0.2.1] - 2026-07-29

### Added

- Root `.gitignore`-aware, deterministic TypeScript/JavaScript source discovery with negation support and permanent tool/build-directory exclusions.
- Repeatable `--scope` indexing option with canonical, persisted project-relative scope roots.
- TypeScript/JavaScript `baseUrl` and `paths` module resolution using the TypeScript compiler API.
- Project-local `tsconfig.json` / `jsconfig.json` selection with tracked local `extends` chains.
- Generation-bound configuration input fingerprints and actionable freshness reasons: `project-inputs-changed`, `configuration-invalid`, and `configuration-untracked`.
- SQLite schema v3 migration for active-generation index inputs; v1 and v2 graph snapshots remain readable without fabricated historical provenance.

### Changed

- Alias imports and their explicit imported calls now retain configuration-path evidence when configuration participated in resolution.
- `index` and `sync` reuse the previous successful scope unless a new `--scope` is supplied.
- Invalid or unsupported project configuration fails explicitly before replacing the active graph generation.

### Deliberate limits

- Only the root `.gitignore` controls discovery in this version; nested ignore files remain out of scope.
- External/package TypeScript `extends`, project references, workspaces, re-exports, CommonJS `require`, watchers, and incremental synchronization are not yet supported.

## [0.2.0] - 2026-07-29

### Added

- An active graph generation for a durable, identifiable successful index.
- Persisted artifact facts for symbols, structural edges, pending references, and TypeScript/JavaScript binding data.
- Per-edge resolution evidence with a rule ID, stage, and considered candidates.
- Read-only `explain-edge` CLI command and `symbol_lattice_explain_edge` MCP tool.
- A shared runtime version contract for the CLI and MCP server.

### Changed

- Complete rebuilds now replace graph, artifact facts, evidence, and active-generation metadata atomically.
- Existing v0.1 indexes remain readable; one explicit `sync` upgrades them to the v0.2.0 evidence model.

### Not yet included

- Watchers, automatic sync, incremental indexing, path aliases, full-text search, and additional language adapters.

## [0.1.0] - 2026-07-29

### Added

- Initial TypeScript/JavaScript local symbol graph.
- Explicit full indexing, caller/callee/impact queries, and read-only MCP exploration.
- `exact`, `heuristic`, and `unresolved` relationship states.

[Unreleased]: https://github.com/HsinPu/symbol-lattice/compare/v0.35.0...HEAD
[0.35.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.34.0...v0.35.0
[0.34.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.33.0...v0.34.0
[0.33.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.32.0...v0.33.0
[0.32.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.31.0...v0.32.0
[0.31.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.30.0...v0.31.0
[0.30.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.29.0...v0.30.0
[0.29.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.28.0...v0.29.0
[0.28.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.27.0...v0.28.0
[0.27.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.26.0...v0.27.0
[0.26.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.25.0...v0.26.0
[0.25.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.24.0...v0.25.0
[0.24.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.23.0...v0.24.0
[0.23.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.22.0...v0.23.0
[0.22.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.21.0...v0.22.0
[0.21.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.20.0...v0.21.0
[0.20.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.19.0...v0.20.0
[0.19.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.18.0...v0.19.0
[0.18.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.17.0...v0.18.0
[0.17.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.16.0...v0.17.0
[0.16.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.15.0...v0.16.0
[0.15.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.14.0...v0.15.0
[0.14.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.13.0...v0.14.0
[0.13.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.12.0...v0.13.0
[0.12.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/HsinPu/symbol-lattice/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/HsinPu/symbol-lattice/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/HsinPu/symbol-lattice/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/HsinPu/symbol-lattice/releases/tag/v0.1.0
