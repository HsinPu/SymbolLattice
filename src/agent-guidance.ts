export const AUTOMATIC_PROJECT_INDEX_GUIDANCE = `- When the current work is inside a recognized software repository and the task requires locating, understanding, or changing source code, run \`SymbolLattice status . --json\` from the resolved repository root before broad file exploration.
- Recognize a software repository only when the resolved root contains \`.git\`, a recognized project manifest, or supported source files. Use that resolved root rather than whichever nested directory happens to be current.
- If \`.SymbolLattice/index.sqlite\` is missing, run \`SymbolLattice init .\` automatically from the resolved repository root before broad exploration. The user does not need to request indexing separately. Briefly tell the user that the local index is being created because initial indexing can take time and disk space.
- Never initialize a filesystem root, home directory, Desktop root, temporary directory, dependency directory, or a parent directory that contains multiple unrelated projects.
- If automatic initialization fails or cannot be performed, report the reason once and fall back to targeted \`rg\` and direct file reads. Never run \`index\` or rebuild an existing index unless the user explicitly requests it.`;

export const SYMBOL_LATTICE_MCP_INSTRUCTIONS = `SymbolLattice provides a local source-code graph for coding agents. Its MCP tools are read-only and query an existing project index.

${AUTOMATIC_PROJECT_INDEX_GUIDANCE}

When an index is available, use \`SymbolLattice_explore\` before grep, find, or broad file reads for code discovery. Prefer narrower SymbolLattice tools for exact source, impact, affected tests, or generation history. Treat pending, unresolved, ambiguous, truncated, or low-confidence results as incomplete evidence. Do not edit or commit files inside \`.SymbolLattice\`.`;
