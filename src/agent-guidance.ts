export const AUTOMATIC_PROJECT_INDEX_GUIDANCE = `- When a task requires locating, understanding, reading, or changing source code, resolve the repository root and run \`SymbolLattice status . --json\` before broad exploration.
- Treat one outer \`.git\` repository as one monorepo, even when it contains multiple packages. Treat a directory containing independent repository or manifest roots as a workspace container, not as a repository.
- In a workspace container, discover relevant repository roots through declared workspace members and child directories at most two levels deep. Skip hidden metadata, dependencies, generated output, caches, archives, and temporary directories.
- If a relevant repository has no \`.SymbolLattice/index.sqlite\`, run \`SymbolLattice init .\` automatically from that repository's resolved root and briefly tell the user that a local index is being created.
- Never initialize a filesystem root, home directory, Desktop root, temporary directory, dependency directory, generated-output directory, or a parent directory that contains multiple unrelated projects.
- For multi-repository tasks, query every relevant repository separately with its own \`projectPath\`. Combine project-scoped findings without claiming cross-repository edges.
- If automatic initialization fails or cannot be performed, report the reason once and fall back to targeted \`rg\` and direct file reads. If an existing index is stale while MCP auto-sync is active, allow one bounded catch-up and retry \`SymbolLattice_explore\` once before falling back; never hide a still-stale result. Never run \`index\` or rebuild an existing index unless the user explicitly requests it.`;

export const SYMBOL_LATTICE_MCP_INSTRUCTIONS = `# SymbolLattice — read-equivalent code intelligence

For any task that locates, explains, reads, or changes indexed code, call \`SymbolLattice_explore\` before Read or Grep. Use it for architecture, flows, bugs, feature work, and named files or symbols. One bounded call returns generation-bound line-numbered source together with exact connections, path evidence, and impact context.

- Treat source returned by explore as already read; do not repeat the same discovery with Read or Grep.
- Do not delegate indexed-code discovery to a file-reading sub-agent. Query SymbolLattice directly, then edit with the returned source and impact evidence in view.
- If the first result lacks a needed detail, call explore again with more specific file or symbol names. Use raw reads only for uncovered details, non-indexed files, or a freshness conflict that remains after one bounded auto-sync catch-up.
- The default MCP surface intentionally exposes only \`SymbolLattice_explore\`. Optional specialist tools remain available through \`SYMBOL_LATTICE_MCP_TOOLS\`; use them only when they are actually listed by the client.

## Project activation and safety

${AUTOMATIC_PROJECT_INDEX_GUIDANCE}

Treat pending, unresolved, ambiguous, truncated, or low-confidence results as incomplete evidence. Do not edit or commit files inside \`.SymbolLattice\`.`;
