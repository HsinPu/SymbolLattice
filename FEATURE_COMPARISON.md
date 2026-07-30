# Feature comparison

This is the root-level, cumulative comparison report for SymbolLattice releases.
Each completed version appends one entry with the shipped capability, the local
CodeGraph baseline inspected for that release, executable evidence, intentional
limits, and a plain-language assessment. It is a product comparison, not a
claim that either project has identical goals or runtime coverage.

## Method

- **SymbolLattice evidence** is limited to source, tests, and release checks in
  this repository.
- **CodeGraph baseline** is the local checkout at
  `C:\Users\win10\Desktop\Graph\codegraph`, inspected on 2026-07-30. A
  comparison only describes the relevant implementation surface, not all of
  CodeGraph's language or framework support.
- **Ahead** means a verified advantage in the named dimension; it does not mean
  universal feature superiority. **Gap** means a deliberately unimplemented
  surface in SymbolLattice.

## v0.26.0 — recursive React Router data-router evidence

### Shipped capability

SymbolLattice now walks a direct literal React Router v6.4+ data-router
`children` tree. It composes static relative child paths, emits static index
routes at their parent's URL, and lets a pathless layout pass URL context to
its literal children. Every emitted route remains a `NAVIGATE` symbol with the
existing exact local/import/re-export handler evidence.

| Concern | SymbolLattice v0.26.0 | CodeGraph baseline | Assessment |
| --- | --- | --- | --- |
| Data-router tree structure | AST validates the factory import/call, literal object fields, direct `children` array, handler form, and path rules before recursively composing a URL. | `src/resolution/frameworks/react.ts` scans `path:` fields with regular expressions after detecting a data-router API; it does not retain parent-child tree context when naming the route. | **Ahead in structural precision.** SymbolLattice can prove `/workspace/settings` rather than treating `settings` as an independent path string. |
| Index and pathless layouts | A static `index: true` route resolves to its proven parent URL; a pathless layout passes parent context but is not emitted as a fabricated public URL. | The inspected branch requires `path:` for its data-router scan, so index and pathless-layout URL composition is not represented there. | **Ahead in navigation semantics** for the explicitly supported literal shapes. |
| Handler evidence | Nested route facts keep the existing `framework.react-router.data-router.imported-handler` or `reexported-handler` evidence and resolver path. | CodeGraph's extractor emits generic source-text references after its regex scan; its route-extraction branch does not make factory import, tree structure, or route-object binding a proof requirement. | **Ahead in explainability** for a claimed nested route. |
| Dynamic or runtime-shaped routers | Dynamic children, spreads, `lazy`, factory options, absolute child paths, and nonliteral route shapes are excluded rather than guessed. | Its source-text scan can observe more broad source forms, but that is not equivalent to statically proving their runtime route tree. | **Deliberate trade-off.** SymbolLattice is more conservative, not automatically broader. |
| Other React surface area | Direct JSX `Route` and direct data-router forms are supported, but nested JSX composition and `createRoutesFromElements` remain unimplemented. | The inspected CodeGraph React resolver also scans JSX `Route` and detects `createRoutesFromElements` as a data-router marker. | **Current coverage gap.** These remain candidates for a later, separately proven pack. |

### Verification evidence

- `test/unit/extraction/extract-file-facts.test.ts` covers nested relative paths,
  index routes, pathless layouts, and unsafe-child rejection boundaries.
- `test/unit/application/resolution.test.ts` proves nested index and child
  handlers preserve exact imported and re-exported evidence.
- `test/integration/application/service.test.ts` proves a nested route persists,
  is returned by `routes`, appears in callers, and survives unrelated-file
  incremental artifact reuse.
- Release verification runs TypeScript checking, the full test suite, build,
  package dry run, and CodeGraph index refresh before commit and push.

### Intentional limits carried forward

- Only direct literal data-router trees are in scope. Nested JSX `Route` trees,
  route-array variables/spreads, runtime config, `basename`, `lazy`, and dynamic
  children stay outside this version.
- The comparison is scoped to React navigation extraction. CodeGraph has broader
  framework and language coverage elsewhere; this report does not score those
  unrelated capabilities.
