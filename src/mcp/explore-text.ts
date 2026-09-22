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
  if (content === null || content.length === 0) return [];
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

function hasSourceContent(source: UnknownRecord): boolean {
  return sourceLines(source).length > 0 ||
    records(record(source.delivery)?.fragments).some((fragment) => text(fragment.text) !== null);
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
    if (existing === undefined || !hasSourceContent(existing)) unique.set(key, source);
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
      if (delivery?.status === "already-served" || delivery?.status === "partially-served") {
        const references = records(delivery.coveredPointers)
          .map((pointer) => text(pointer.display))
          .filter((display): display is string => display !== null);
        const sourceId = text(delivery.sourceId);
        if (references.length === 0 && sourceId !== null) references.push(sourceId);
        output.push(`- \`${filePath}\` — ${delivery.status === "already-served" ? "already served" : "partially served"}${references.length === 0 ? "" : `; prior source: ${references.map((reference) => `\`${reference}\``).join(", ")}`}.`);
        for (const fragment of records(delivery.fragments)) {
          const content = text(fragment.text);
          if (content === null) continue;
          const pointer = record(fragment.pointer);
          const startLine = sourceLine(pointer);
          const display = text(pointer?.display) ?? text(record(fragment.sourceIdentity)?.id) ?? filePath;
          // Without a verified pointer, retain the bytes without inventing line numbers.
          const fragmentLines = startLine === null
            ? content.split("\n")
            : content.split("\n").map((line, index) => `${startLine + index}\t${line}`);
          output.push(`**New source fragment: \`${display}\`**`, "", `\`\`\`${sourceLanguage(filePath)}`, ...fragmentLines, "```", "");
        }
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
  const freshness = status.initialized === false ? "not initialized"
    : status.stale === true ? "stale"
    : status.stale === false ? "up to date" : "freshness unknown";
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
    const sourceTerms = records(focus.sourceMatches).map((match) =>
      `\`${text(match.term) ?? "?"}\` → \`${text(match.token) ?? "?"}\` at \`${symbolLocation(match)}\``);
    if (sourceTerms.length > 0) output.push(`  Source terms (lexical, not resolved relationships): ${sourceTerms.join("; ")}.`);
    const numeric = record(focus.numericQualifier);
    if (numeric !== null && Array.isArray(numeric.terms)) output.push(
      `  Numeric qualifier: ${numeric.terms.filter(term => typeof term === "string").map(term => `\`${term}\``).join(", ")} matches the declaration name or cited source token.`);
    const followup = record(focus.nameFollowup);
    if (followup !== null) {
      output.push("  Supplementary same-name declaration; the call target remains unresolved.");
      for (const edge of records(followup.calls)) output.push(
        `  Written call \`${text(edge.referenceName) ?? "?"}\`${edgeDetails(edge)}.`);
      output.push(`  ${finiteNumber(followup.matchingDeclarationCount) ?? "Unknown number of"} same-name declarations in the bounded candidates; this is not a repository-wide uniqueness claim.`);
    }
    const reused = records(record(focus.sourceReuse)?.segments);
    if (reused.length > 0) output.push(`  Shared source: ${reused.map((segment) =>
      `focus #${(finiteNumber(segment.referenceIndex) ?? -1) + 1} at \`${symbolLocation(segment)}\``).join("; ")}.`);
  }
  const calleeTerms = records(result.sourceWindows).flatMap((window) => records(window.sourceMatches)).map((match) =>
    `\`${text(match.term) ?? "?"}\` → \`${text(match.token) ?? "?"}\` at \`${symbolLocation(match)}\``);
  if (calleeTerms.length > 0) output.push("", `Related source terms (lexical, not resolved relationships): ${calleeTerms.join("; ")}.`);
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
    ? [`No exact symbol found for \`${reference}\`.`,
      "This does not prove the symbol or relationship is absent. Check the project and index status, then try a file path or a more specific query."]
    : [];
}

function edgeDetails(edge: UnknownRecord | null): string {
  if (edge === null) return " — evidence unavailable";
  const details: string[] = [];
  const location = symbolLocation(edge);
  if (location.length > 0) details.push(`at \`${location}\``);
  details.push(text(edge.resolution) ?? "resolution unspecified");
  const evidence = record(edge.evidence);
  const stage = text(evidence?.stage);
  const rule = text(evidence?.ruleId);
  if (stage !== null) details.push(stage);
  if (rule !== null) details.push(`rule \`${rule}\``);
  const commonJs = record(evidence?.commonJsBinding);
  if (commonJs !== null) {
    details.push(`CommonJS \`${text(commonJs.localName) ?? "?"}\` ← \`${text(commonJs.importedName) ?? "?"}\``);
    details.push(`import \`${symbolLocation(commonJs.importSite)}\`; export \`${symbolLocation(commonJs.exportSite)}\``);
  }
  return ` — ${details.join("; ")}`;
}

function renderRelations(result: UnknownRecord): string[] {
  const relations = new Set<string>();
  const add = (from: string, to: string, edge: UnknownRecord | null): void => {
    relations.add(`- \`${from}\` → \`${to}\` (${text(edge?.kind) ?? "related"})${edgeDetails(edge)}`);
  };
  for (const connection of records(result.connections)) {
    const from = symbolReference(connection.source);
    const to = symbolReference(connection.target);
    const edge = record(connection.edge);
    if (from !== null && to !== null) add(from, to, edge);
  }
  for (const context of [result, ...records(result.focuses)]) {
    const focal = symbolReference(record(context.match)?.symbol) ?? symbolReference(context.symbol);
    for (const label of ["callers", "callees"] as const) {
      const value = context[label];
      for (const relation of records(Array.isArray(value) ? value : record(value)?.items)) {
        const reference = symbolReference(relation.symbol);
        const edge = record(relation.edge);
        if (reference === null) continue;
        if (focal !== null) {
          add(label === "callers" ? reference : focal, label === "callers" ? focal : reference, edge);
        } else {
          relations.add(`- ${label === "callers" ? "caller" : "callee"}: \`${reference}\` (${text(edge?.kind) ?? "related"})${edgeDetails(edge)}`);
        }
      }
    }
  }
  for (const path of records(result.impact)) {
    const chain = Array.isArray(path.symbols)
      ? path.symbols.map(symbolReference).filter((item): item is string => item !== null)
      : [];
    if (chain.length > 1) {
      relations.add([
        `- impact (reverse dependency): ${chain.map((item) => `\`${item}\``).join(" → ")}`,
        ...records(path.edges).map((edge) => `  - ${text(edge.kind) ?? "related"}${edgeDetails(edge)}`)
      ].join("\n"));
    }
  }
  return relations.size === 0 ? [] : ["**Relationships**", "", ...relations];
}

function renderEvidencePaths(result: UnknownRecord): string[] {
  const output: string[] = [];
  const seen = new Set<string>();
  const paths: UnknownRecord[] = [
    ...records(result.evidencePaths),
    ...records(record(result.pathSpinePlan)?.spines).map((spine) => ({ status: "path", path: spine.path })),
    ...records(result.focuses).flatMap((focus) => {
      const flow = record(record(focus.focusCoverage)?.flow);
      return flow === null ? [] : [{ status: "path", path: flow.path }];
    })
  ];
  for (const entry of paths) {
    const path = record(entry.path);
    const steps = records(path?.steps);
    const lines: string[] = [];
    for (const step of steps) {
      const from = symbolReference(step.from);
      const to = symbolReference(step.to);
      if (from === null || to === null) continue;
      const edge = record(step.edge);
      lines.push(`- \`${from}\` → \`${to}\` (${text(edge?.kind) ?? "related"})${edgeDetails(edge)}`);
    }
    if (lines.length > 0) {
      const key = lines.join("\n");
      if (!seen.has(key)) {
        seen.add(key);
        output.push(...lines);
      }
    } else {
      const pair = `\`${text(entry.fromReference) ?? "unknown"}\` → \`${text(entry.toReference) ?? "unknown"}\``;
      if (entry.status === "no-path") output.push(`- ${pair}: No exact path found within the search bounds; this does not prove no relationship exists.`);
      if (entry.status === "truncated") output.push(`- ${pair}: Path search truncated; connectivity remains unverified.`);
      if (entry.status === "not-applicable") output.push(`- ${pair}: Path not checked because the endpoints were not both resolved.`);
      if (entry.status === "same-symbol") output.push(`- ${pair}: Both references identify the same symbol.`);
    }
  }
  return output.length === 0 ? [] : ["**Path Evidence**", "", ...output];
}

function renderLimitations(result: UnknownRecord): string[] {
  const notes = new Set<string>();
  const plan = record(result.queryPlan);
  const sourceLexical = record(plan?.sourceLexical);
  if (sourceLexical?.truncated === true) notes.add("Callable-source lexical search reached its scan bounds; further matches may exist. Narrow the query or specify a file to continue.");
  if (sourceLexical?.state === "unavailable") notes.add("Indexed source is unavailable for lexical ranking; this result uses symbol and graph evidence.");
  if (record(plan?.input)?.truncated === true) notes.add("Query text was truncated; retry with a shorter query.");
  if (record(plan?.summary)?.truncated === true) notes.add("Focus selection was truncated; narrow the query to a file or qualified symbol.");
  if (result.connectionsTruncated === true) notes.add("Additional exact connections were truncated.");
  if (record(record(result.sourceWindowPlan)?.summary)?.truncated === true ||
      record(record(result.sourceWindowAllocation)?.summary)?.truncated === true) {
    notes.add("Source windows were limited; additional call-site source may be omitted.");
  }
  const unavailableSites = finiteNumber(record(record(result.sourceWindowPlan)?.summary)?.unavailableFileSiteCount) ?? 0;
  const calleeSearch = record(record(result.sourceWindowPlan)?.calleeSourceSearch);
  if (record(record(result.queryPlan)?.input)?.identifierTermsTruncated === true) notes.add(
    "Query terms exceeded the bounded term budget; later terms were omitted. Shorten the query to retain essential qualifiers.");
  const followupSearch = record(record(result.queryPlan)?.nameFollowupSearch);
  if (followupSearch !== null) {
    if (followupSearch.state !== "searched") notes.add(`Same-name follow-up evidence ${text(followupSearch.state) ?? "unavailable"}; no call target was inferred.`);
    if (followupSearch.callsTruncated === true || followupSearch.candidatesTruncated === true) notes.add(
      "Same-name follow-up search reached its call or candidate bounds; inspect the cited unresolved calls for additional leads.");
  }
  if (calleeSearch?.truncated === true) notes.add("Related callee source search reached its bounds; narrow the query or retrieve the cited callee directly.");
  const unavailableCalleeFiles = Array.isArray(calleeSearch?.unavailableFiles)
    ? calleeSearch.unavailableFiles.filter((file): file is string => typeof file === "string") : [];
  if (unavailableCalleeFiles.length > 0) notes.add(`Indexed callee source is unavailable for: ${unavailableCalleeFiles.map((file) => `\`${file}\``).join(", ")}.`);
  if (unavailableSites > 0) {
    notes.add(`${unavailableSites} exact call sites are in files outside the current source envelope; follow their cited file and line to retrieve source.`);
  }
  if (record(record(result.sourceAllocation)?.summary)?.truncated === true) notes.add("Primary source was limited by the shared character budget.");
  const spineSummary = record(record(result.pathSpinePlan)?.summary);
  if (records(result.focuses).some((focus) => record(record(focus.focusCoverage)?.flow)?.truncated === true)) {
    notes.add("Downstream focus search reached its bounds; other relevant flow steps may be omitted.");
  }
  if (spineSummary?.pairAttemptsTruncated === true || spineSummary?.spinesTruncated === true || spineSummary?.traversalTruncated === true) {
    notes.add("Path exploration was limited; the displayed paths are not exhaustive.");
  }
  for (const context of [result, ...records(result.focuses)]) {
    const reference = symbolReference(context.symbol) ?? text(context.reference) ?? symbolReference(record(context.match)?.symbol);
    const suffix = reference === null ? "" : ` for \`${reference}\``;
    if (context.sourceAvailability === "unavailable") notes.add(`Source unavailable${suffix} in the indexed generation.`);
    for (const [field, label] of [["callers", "Callers"], ["callees", "Callees"], ["impact", "Impact paths"]] as const) {
      if (record(context[field])?.truncated === true) notes.add(`${label} were truncated${suffix}.`);
    }
  }
  const focusImpactCount = records(result.focuses).reduce(
    (count, focus) => count + records(record(focus.impact)?.paths).length, 0
  );
  if (focusImpactCount > 0) {
    notes.add(`${focusImpactCount} per-focus reverse-impact paths are omitted from this compact view; retrieve them with \`SymbolLattice explore <query> --json --project <project>\`.`);
  }
  for (const source of sourceCandidates(result)) {
    if (source.truncated !== true) continue;
    const filePath = text(source.filePath) ?? "unknown source";
    const requested = finiteNumber(source.requestedCharacters);
    const emitted = finiteNumber(source.emittedCharacters);
    const counts = requested === null || emitted === null ? "" : ` (${emitted}/${requested} characters)`;
    notes.add(`Source truncated for \`${filePath}\`${counts}; the excerpt may end mid-line.`);
  }
  if (notes.size === 0) return [];
  return ["**Coverage and Next Steps**", "", ...[...notes].map((note) => `- ${note}`),
    "", "For omitted source, read the cited file and line range, or use `SymbolLattice file <path> --offset <line> --limit <count> --project <project>`. For relationships, explore the cited qualified symbol. These bounded results do not prove that other files or relationships are absent."];
}

function renderUnresolvedCalls(result: UnknownRecord): string[] {
  const lines: string[] = [];
  const contexts = records(result.focuses).length > 0 ? records(result.focuses) : [result];
  for (const context of contexts) {
    const evidence = record(context.unresolvedCalls);
    if (evidence === null) continue;
    const owner = symbolReference(record(context.symbol) ?? record(record(context.match)?.symbol)) ?? "selected symbol";
    if (evidence.state !== "available") {
      lines.push(`- \`${owner}\`: unresolved-call evidence ${text(evidence.state) ?? "unavailable"}.`);
      continue;
    }
    for (const edge of records(evidence.items)) {
      lines.push(`- \`${owner}\` invokes \`${text(edge.referenceName) ?? "unknown member"}\`${edgeDetails(edge)}; target unknown.`);
    }
    if (evidence.truncated === true) lines.push(`- Additional recorded calls for \`${owner}\` were truncated; inspect its cited source.`);
  }
  return lines.length === 0 ? [] : ["**Unresolved Call Sites**", "", ...lines,
    "These source locations do not prove a target or runtime dispatch. Missing records do not prove that other calls are absent."];
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
    renderRelations(value),
    renderUnresolvedCalls(value),
    renderEvidencePaths(value),
    renderLimitations(value)
  ].filter((section) => section.length > 0);
  const sources = renderSources(value);
  if (sources.length > 0) sections.push(["**Source Code**", "", ...sources]);
  return `${sections.map((section) => section.join("\n")).join("\n\n").trim()}\n`;
}
