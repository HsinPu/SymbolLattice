export const AUTOMATIC_PROJECT_INDEX_GUIDANCE = `- When the current work is inside a recognized software repository and the task requires locating, understanding, or changing source code, run \`SymbolLattice status . --json\` from the resolved repository root before broad file exploration.
- Resolve repository topology before indexing. A directory governed by one outer \`.git\` root is a monorepo even when it contains multiple packages or project manifests; initialize that outer repository once. A directory whose child projects have separate \`.git\` roots, or distinct manifest roots not governed by one outer \`.git\`, is a workspace container and is not itself a repository.
- Recognize an individual software repository only when its resolved root contains \`.git\`, a recognized project manifest, or supported source files. Use that resolved root rather than whichever nested directory happens to be current.
- When the current path is a workspace container, discover candidate repository roots with a bounded pass over declared workspace members and child directories at most two levels deep. Skip hidden metadata, dependencies, generated output, caches, archives, and temporary directories; do not perform an unbounded recursive crawl.
- If the task concerns one repository, initialize only that repository. If the user asks about the whole workspace or multiple repositories, initialize each relevant repository separately and never initialize the workspace container. For every missing \`.SymbolLattice/index.sqlite\`, run \`SymbolLattice init .\` automatically from that repository's resolved root before broad exploration. The user does not need to request indexing separately. Briefly tell the user which local indexes are being created because initial indexing can take time and disk space.
- Never initialize a filesystem root, home directory, Desktop root, temporary directory, dependency directory, generated-output directory, or a parent directory that contains multiple unrelated projects.
- For a whole-workspace question, query every relevant repository index separately, pass its own \`projectPath\` on each SymbolLattice call, and combine the project-scoped findings in the answer. Do not infer cross-repository edges or present the combined result as one graph.
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
