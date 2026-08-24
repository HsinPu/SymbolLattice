type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function records(value: unknown): UnknownRecord[] {
  return Array.isArray(value)
    ? value.map(record).filter((item): item is UnknownRecord => item !== null)
    : [];
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function symbolFrom(value: unknown): UnknownRecord | null {
  const item = record(value);
  if (item === null) return null;
  return record(item.symbol) ?? record(record(item.match)?.symbol) ?? item;
}

function symbolReference(value: unknown): string | null {
  const symbol = symbolFrom(value);
  return text(symbol?.qualifiedName) ?? text(symbol?.name);
}

function sourceLine(value: unknown): number | null {
  const item = record(value);
  const range = record(item?.range);
  const start = record(range?.start);
  return finiteNumber(start?.line);
}

function symbolLocation(value: unknown): string {
  const symbol = symbolFrom(value);
  if (symbol === null) return "";
  const filePath = text(symbol.filePath);
  const line = sourceLine(symbol);
  if (filePath === null) return "";
  return line === null ? filePath : `${filePath}:${line}`;
}

function sourceLanguage(filePath: string): string {
  const extension = filePath.split(".").pop()?.toLowerCase();
  const languages: Readonly<Record<string, string>> = {
    c: "c",
    cc: "cpp",
    cpp: "cpp",
    cs: "csharp",
    css: "css",
    go: "go",
    html: "html",
    java: "java",
    js: "javascript",
    jsx: "jsx",
    json: "json",
    kt: "kotlin",
    lua: "lua",
    md: "markdown",
    php: "php",
    py: "python",
    rb: "ruby",
    rs: "rust",
    sh: "bash",
    sql: "sql",
    swift: "swift",
    ts: "typescript",
    tsx: "tsx",
    vue: "vue",
    xml: "xml",
    yaml: "yaml",
    yml: "yaml"
  };
  return extension === undefined ? "text" : languages[extension] ?? "text";
}

function sourceLines(source: UnknownRecord): string[] {
  const lines = records(source.lines)
    .map((line) => {
      const number = finiteNumber(line.line);
      const content = typeof line.text === "string" ? line.text : null;
      return number === null || content === null ? null : `${number}\t${content}`;
    })
    .filter((line): line is string => line !== null);
  if (lines.length > 0) return lines;

  const content = typeof source.text === "string" ? source.text : null;
  if (content === null) return [];
  const startLine = finiteNumber(source.startLine) ?? 1;
  return content.split("\n").map((line, index) => `${startLine + index}\t${line}`);
}

function sourceKey(source: UnknownRecord): string {
  return [
    text(source.filePath) ?? "unknown",
    finiteNumber(source.startLine) ?? "",
    finiteNumber(source.endLine) ?? ""
  ].join(":");
}

function sourceCandidates(result: UnknownRecord): UnknownRecord[] {
  const candidates: UnknownRecord[] = [];
  const exact = record(result.source);
  if (exact !== null) candidates.push(exact);
  for (const focus of records(result.focuses)) {
    const source = record(focus.source);
    if (source !== null) candidates.push(source);
  }
  for (const window of records(result.sourceWindows)) {
    const source = record(window.source);
    if (source !== null) candidates.push(source);
  }
  const unique = new Map<string, UnknownRecord>();
  for (const source of candidates) {
    const key = sourceKey(source);
    const existing = unique.get(key);
    if (existing === undefined || sourceLines(existing).length === 0) unique.set(key, source);
  }
  return [...unique.values()];
}

function renderSources(result: UnknownRecord): string[] {
  const output: string[] = [];
  for (const source of sourceCandidates(result)) {
    const filePath = text(source.filePath) ?? "unknown source";
    const lines = sourceLines(source);
    if (lines.length === 0) {
      const delivery = record(source.delivery);
      const pointer = record(delivery?.pointer);
      const display = text(pointer?.display);
      if (delivery?.status === "already-served") {
        output.push(`- \`${filePath}\` — already served${display === null ? "" : ` as \`${display}\``}.`);
      }
      continue;
    }
    const start = finiteNumber(source.startLine);
    const end = finiteNumber(source.endLine);
    const span = start === null || end === null ? "" : ` — lines ${start}–${end}`;
    output.push(`**\`${filePath}\`**${span}`, "", `\`\`\`${sourceLanguage(filePath)}`, ...lines, "```", "");
  }
  return output;
}

function renderStatus(result: UnknownRecord): string {
  const status = record(result.status);
  if (status === null) return "Index status unavailable.";
  const freshness = status.stale === true ? "stale" : "up to date";
  const parts = [`Index: ${freshness}`];
  const projectPath = text(status.projectPath);
  if (projectPath !== null) parts.push(projectPath);
  const counts = record(status.counts);
  if (counts !== null) {
    const files = finiteNumber(counts.files);
    const symbols = finiteNumber(counts.symbols);
    const edges = finiteNumber(counts.edges);
    if (files !== null) parts.push(`${files} files`);
    if (symbols !== null) parts.push(`${symbols} symbols`);
    if (edges !== null) parts.push(`${edges} edges`);
  }
  const staleReasons = Array.isArray(status.staleReasons)
    ? status.staleReasons.filter((reason): reason is string => typeof reason === "string")
    : [];
  return `${parts.join(" · ")}${staleReasons.length === 0 ? "" : ` · reasons: ${staleReasons.join(", ")}`}`;
}

function renderFocuses(result: UnknownRecord): string[] {
  const focuses = records(result.focuses);
  if (focuses.length === 0) return [];
  const output = [`Found ${focuses.length} ranked focus${focuses.length === 1 ? "" : "es"}.`, "", "**Focuses**", ""];
  for (const focus of focuses) {
    const reference = symbolReference(focus) ?? text(focus.reference) ?? "unknown symbol";
    const symbol = symbolFrom(focus);
    const kind = text(symbol?.kind);
    const location = symbolLocation(focus);
    const rank = finiteNumber(focus.rank);
    output.push(`- ${rank === null ? "" : `#${rank} `}\`${reference}\`${kind === null ? "" : ` (${kind})`}${location.length === 0 ? "" : ` — ${location}`}`);
  }
  return output;
}

function renderMatch(result: UnknownRecord): string[] {
  const match = record(result.match);
  if (match === null) return [];
  const reference = text(match.reference) ?? "the requested symbol";
  if (match.status === "exact") {
    const symbol = record(match.symbol);
    const symbolName = symbolReference(symbol) ?? reference;
    const kind = text(symbol?.kind);
    const location = symbolLocation(symbol);
    return [
      "**Match**",
      "",
      `- \`${symbolName}\`${kind === null ? "" : ` (${kind})`}${location.length === 0 ? "" : ` — ${location}`}`
    ];
  }
  if (match.status === "ambiguous") {
    const candidates = records(match.candidates);
    return [
      `Found ${candidates.length} candidates for \`${reference}\`:`,
      "",
      ...candidates.map((candidate) => `- \`${symbolReference(candidate) ?? "unknown symbol"}\` — ${symbolLocation(candidate)}`)
    ];
  }
  return records(result.focuses).length === 0
    ? [`No exact symbol found for \`${reference}\`.`]
    : [];
}

function renderRelations(result: UnknownRecord): string[] {
  const relations: string[] = [];
  for (const connection of records(result.connections)) {
    const from = symbolReference(connection.source);
    const to = symbolReference(connection.target);
    const edge = record(connection.edge);
    const kind = text(edge?.kind) ?? "related";
    if (from !== null && to !== null) relations.push(`- \`${from}\` → \`${to}\` (${kind})`);
  }
  for (const [label, value] of [["caller", result.callers], ["callee", result.callees]] as const) {
    for (const relation of records(value)) {
      const reference = symbolReference(relation.symbol);
      const kind = text(record(relation.edge)?.kind) ?? "related";
      if (reference !== null) relations.push(`- ${label}: \`${reference}\` (${kind})`);
    }
  }
  for (const path of records(result.impact)) {
    const chain = Array.isArray(path.symbols)
      ? path.symbols.map(symbolReference).filter((item): item is string => item !== null)
      : [];
    if (chain.length > 1) relations.push(`- impact: ${chain.map((item) => `\`${item}\``).join(" → ")}`);
  }
  if (relations.length === 0) return [];
  return ["**Relationships**", "", ...relations, ...(result.connectionsTruncated === true ? ["- Additional exact connections were truncated."] : [])];
}

/** Renders the primary MCP explore result for agents and humans without diagnostic JSON. */
export function renderExploreText(value: Record<string, unknown>): string {
  const match = record(value.match);
  const queryPlan = record(value.queryPlan);
  const title = text(queryPlan?.query) ?? text(match?.reference) ?? "code graph";
  const sections: string[][] = [
    [`**Exploration: ${title}**`, "", renderStatus(value)],
    renderFocuses(value),
    renderMatch(value),
    renderRelations(value)
  ].filter((section) => section.length > 0);
  const sources = renderSources(value);
  if (sources.length > 0) sections.push(["**Source Code**", "", ...sources]);
  return `${sections.map((section) => section.join("\n")).join("\n\n").trim()}\n`;
}
