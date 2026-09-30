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
  const graphConnectionsById = new Map(records(record(result.queryPlan)?.graphConnectionEvidence)
    .flatMap((entry): readonly [string, UnknownRecord][] => {
      const id = text(entry.symbolId);
      return id === null ? [] : [[id, entry]];
    }));
  const output = [`Found ${focuses.length} ranked focus${focuses.length === 1 ? "" : "es"}.`, "", "**Focuses**", ""];
  if (record(record(result.queryPlan)?.numericCoverage) !== null) output.push("Numeric coverage reserves a file slot for a supported numeric match so generic terms do not discard every numeric qualifier.", "");
  for (const focus of focuses) {
    const reference = symbolReference(focus) ?? text(focus.reference) ?? "unknown symbol";
    const symbol = symbolFrom(focus);
    const kind = text(symbol?.kind);
    const location = symbolLocation(focus);
    const rank = finiteNumber(focus.rank);
    output.push(`- ${rank === null ? "" : `#${rank} `}\`${reference}\`${kind === null ? "" : ` (${kind})`}${location.length === 0 ? "" : ` — ${location}`}`);
    const sourceTerms = records(focus.sourceMatches).map(renderSourceTerm);
    if (sourceTerms.length > 0) output.push(`  Source terms (lexical, not resolved relationships): ${sourceTerms.join("; ")}.`);
    const graphConnections = graphConnectionsById.get(text(symbol?.id) ?? "");
    const witnesses = records(graphConnections?.witnesses);
    if (witnesses.length > 0) {
      output.push("  Graph ranking evidence (exact static links between bounded candidates; task relevance is not proven):");
      for (const witness of witnesses) {
        const edge = record(witness.edge);
        const neighbor = record(witness.neighbor);
        const from = edge?.sourceId === symbol?.id ? symbolReference(focus) : symbolReference(neighbor);
        const to = edge?.sourceId === symbol?.id ? symbolReference(neighbor) : symbolReference(focus);
        if (from !== null && to !== null && edge !== null) output.push(
          `  - \`${from}\` → \`${to}\` (${text(edge.kind) ?? "related"})${edgeDetails(edge)}.`);
      }
      const omitted = finiteNumber(graphConnections?.omittedRelationCount) ?? 0;
      if (omitted > 0) output.push(`  ${omitted} further candidate links omitted from this bounded ranking receipt.`);
    }
    const numeric = record(focus.numericQualifier);
    if (numeric !== null && Array.isArray(numeric.terms)) output.push(
      `  Numeric qualifier: ${numeric.terms.filter(term => typeof term === "string").map(term => `\`${term}\``).join(", ")} matches the declaration name or cited source token.`);
    const followup = record(focus.nameFollowup);
    const imported = record(focus.importedCallDeclaration);
    if (imported !== null) {
      output.push("  Supplementary declaration candidate from imported construction context; receiver and call target remain unconfirmed.");
      for (const [label, value] of [["Written unresolved call", imported.call], ["Direct import", imported.importEdge],
        ["Caller context", imported.callerEdge], ["Construction context", imported.constructionEdge],
        ["Declaration containment", imported.containmentEdge]] as const) {
        const edge = record(value);
        if (edge !== null) output.push(`  ${label}${edgeDetails(edge)}.`);
      }
      output.push(`  ${finiteNumber(imported.matchingDeclarationCount) ?? "Unknown number of"} matching declarations in the bounded read; this is not repository-wide uniqueness or confirmed dispatch.`);
    }
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
  const calleeTerms = records(result.sourceWindows).flatMap((window) => records(window.sourceMatches)).map(renderSourceTerm);
  if (calleeTerms.length > 0) output.push("", `Related source terms (lexical, not resolved relationships): ${calleeTerms.join("; ")}.`);
  return output;
}

function renderSourceTerm(match: UnknownRecord): string {
  const context = match.lineContext === "comment-prefixed" ? " (comment-prefixed line)" : "";
  return `\`${text(match.term) ?? "?"}\` → \`${text(match.token) ?? "?"}\` at \`${symbolLocation(match)}\`${context}`;
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
  const rejectionFiltering = record(plan?.rejectionReferenceFiltering);
  const omittedRejectionFocuses = records(rejectionFiltering?.omitted);
  if (rejectionFiltering?.evidenceScope === "returned-bounded-graph" && omittedRejectionFocuses.length > 0) {
    const omittedPaths = [...new Set(omittedRejectionFocuses.map((focus) => text(focus.filePath))
      .filter((path): path is string => path !== null))];
    const locations = omittedPaths.length === 0 ? "" :
      ` at ${omittedPaths.map((path) => `\`${path}\``).join(", ")}`;
    notes.add(`${omittedRejectionFocuses.length} lower-priority symbol focuses${locations} with covered query terms were omitted from this bounded result. Their files may still matter; inspect \`queryPlan.rejectionReferenceFiltering.omitted\` with \`SymbolLattice explore <query> --json --project <project>\`, or query a file directly.`);
  }
  if (result.connectionsTruncated === true) notes.add("Additional exact connections were truncated.");
  const coveredFiltering = record(plan?.coveredContextFiltering);
  const omittedContext = records(coveredFiltering?.omitted);
  if (omittedContext.length > 0) {
    const paths = [...new Set(omittedContext.map(item => text(record(item.symbol)?.filePath)).filter(path => path !== null))];
    notes.add(`${omittedContext.length} lower-priority focuses at ${paths.map(path => `\`${path}\``).join(", ")} were omitted because their query concepts are covered by the cited anchor. This bounded heuristic does not prove irrelevance or complete flow coverage. Inspect \`queryPlan.coveredContextFiltering\` for source receipts and exact symbol references, or query the file directly.`);
  }
  if (record(record(result.sourceWindowPlan)?.summary)?.truncated === true ||
      record(record(result.sourceWindowAllocation)?.summary)?.truncated === true) {
    notes.add("Source windows were limited; additional call-site source may be omitted.");
  }
  const unavailableSites = finiteNumber(record(record(result.sourceWindowPlan)?.summary)?.unavailableFileSiteCount) ?? 0;
  const lexicalSearch = record(record(result.sourceWindowPlan)?.lexicalWindowSearch);
  if (lexicalSearch?.truncated === true) notes.add("Some lexical hit windows were omitted by source or window limits; follow the cited match coordinates for more source.");
  if ((finiteNumber(lexicalSearch?.rejectedMatches) ?? 0) > 0) notes.add("Some lexical receipts did not match the available source or owning declaration and were excluded.");
  if (Array.isArray(lexicalSearch?.unavailableFiles) && lexicalSearch.unavailableFiles.length > 0) notes.add("Source for some lexical hits was unavailable in this read.");
  const calleeSearch = record(record(result.sourceWindowPlan)?.calleeSourceSearch);
  if (record(record(result.queryPlan)?.input)?.identifierTermsTruncated === true) notes.add(
    "Query terms exceeded the bounded term budget; later terms were omitted. Shorten the query to retain essential qualifiers.");
  const followupSearch = record(record(result.queryPlan)?.nameFollowupSearch);
  if (followupSearch !== null) {
    if (followupSearch.state !== "searched") notes.add(`Same-name follow-up evidence ${text(followupSearch.state) ?? "unavailable"}; no call target was inferred.`);
    if (followupSearch.callsTruncated === true || followupSearch.candidatesTruncated === true) notes.add(
      "Same-name follow-up search reached its call or candidate bounds; inspect the cited unresolved calls for additional leads.");
  }
  const importedSearch = record(record(result.queryPlan)?.importedDeclarationSearch);
  if (importedSearch !== null) {
    if (importedSearch.state !== "searched") notes.add(`Imported construction declaration evidence ${text(importedSearch.state) ?? "unavailable"}; no receiver or call target was inferred.`);
    if (importedSearch.truncated === true) notes.add("Imported construction declaration search reached its call, witness or supplementary-file bounds; query the cited call or declaration directly for more evidence.");
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
  const leadLines: string[] = [];
  const otherLines: string[] = [];
  const focuses = records(result.focuses);
  const contexts = focuses.length > 0 ? focuses : [result];
  const queryPlan = record(result.queryPlan);
  const queryTerms = Array.isArray(queryPlan?.identifierTerms)
    ? (queryPlan.identifierTerms as unknown[])
      .filter((term): term is string => typeof term === "string" && term.length >= 4)
      .map((term) => term.toLowerCase())
    : [];
  for (const context of contexts) {
    const evidence = record(context.unresolvedCalls);
    if (evidence === null) continue;
    const sameClassLeads = record(evidence.sameClassDeclarationLeads);
    const sameClassByEdgeId = new Map(records(sameClassLeads?.items)
      .map((lead) => [text(lead.edgeId), lead] as const)
      .filter((entry): entry is readonly [string, UnknownRecord] => entry[0] !== null));
    const owner = symbolReference(record(context.symbol) ?? record(record(context.match)?.symbol)) ?? "selected symbol";
    if (evidence.state !== "available") {
      otherLines.push(`- \`${owner}\`: unresolved-call evidence ${text(evidence.state) ?? "unavailable"}.`);
      continue;
    }
    for (const edge of records(evidence.items)) {
      const referenceName = text(edge.referenceName);
      const memberName = referenceName?.split(".").at(-1);
      const sourceFile = text(edge.filePath);
      const ownerSymbol = record(context.symbol);
      const leads = edge.kind === "calls" && edge.resolution === "unresolved" && edge.targetId === null &&
        ownerSymbol !== null && ownerSymbol.id === edge.sourceId && ownerSymbol.filePath === sourceFile &&
        memberName !== undefined && memberName.length >= 6 && sourceFile !== null &&
        symbolLocation(edge).length > 0 &&
        queryTerms.some((term) => memberName.toLowerCase().includes(term))
        ? focuses.filter((focus) => {
          const symbol = record(focus.symbol);
          return symbol?.name === memberName && symbol.filePath !== sourceFile &&
            ["function", "method", "entrypoint"].includes(symbol.kind as string) &&
            symbolLocation(symbol).length > 0;
        }) : [];
      const line = `- \`${owner}\` invokes \`${referenceName ?? "unknown member"}\`${edgeDetails(edge)}; target unknown.`;
      const sameClass = sameClassByEdgeId.get(text(edge.id) ?? "");
      const declaration = record(sameClass?.declaration);
      const declarationLine = record(sameClass?.declarationLine);
      const sourceText = text(declarationLine?.text)?.trim().replaceAll("`", "\\`");
      const leadNotes: string[] = [];
      if (declaration !== null && sourceText !== undefined && sourceText !== null) {
        leadNotes.push(`Same-class declaration \`${symbolReference(declaration) ?? "unknown"}\` at \`${symbolLocation(declaration)}\`: \`${sourceText}\`${declarationLine?.truncated === true ? " (line shortened)" : ""} (candidate only).`);
      }
      if (leads.length > 0) {
        leadNotes.push(`Same-name selected declaration${leads.length === 1 ? "" : "s"}: ${
          leads.map((lead) => `\`${symbolReference(lead) ?? memberName}\` at \`${symbolLocation(lead)}\``).join("; ")
        } (candidate only).`);
      }
      if (leadNotes.length > 0) {
        leadLines.push(`${line} ${leadNotes.join(" ")}`);
      } else {
        otherLines.push(line);
      }
    }
    if (evidence.truncated === true) otherLines.push(`- Additional recorded calls for \`${owner}\` were truncated; inspect its cited source.`);
    const omitted = finiteNumber(sameClassLeads?.omittedCount);
    if (omitted !== null && omitted > 0) otherLines.push(`- ${omitted} additional same-class declaration leads for \`${owner}\` were omitted; inspect its unresolved calls and cited source.`);
  }
  const lines = [...leadLines, ...otherLines];
  const caveat = leadLines.length > 0
    ? "Declaration leads are bounded candidates, not resolved call targets. These source locations do not prove runtime dispatch. Missing records do not prove that other calls are absent."
    : "These source locations do not prove a target or runtime dispatch. Missing records do not prove that other calls are absent.";
  return lines.length === 0 ? [] : ["**Unresolved Call Sites**", "", ...lines,
    caveat];
}

function renderSourceBackedLead(result: UnknownRecord): string[] {
  const priority = record(record(result.queryPlan)?.rejectionReferencePriority);
  if (priority?.evidenceScope !== "static-property-reference") return [];
  const sourceId = text(priority.sourceSymbolId);
  const errorId = text(priority.errorSymbolId);
  const edgeIds = Array.isArray(priority.edgeIds)
    ? priority.edgeIds.filter((id): id is string => typeof id === "string") : [];
  if (sourceId === null || errorId === null || edgeIds.length === 0) return [];
  const focuses = records(result.focuses);
  const source = focuses.find((focus) => text(record(focus.symbol)?.id) === sourceId);
  const error = focuses.find((focus) => text(record(focus.symbol)?.id) === errorId);
  if (source === undefined || error === undefined) return [];
  const edge = records(result.connections).map((connection) => record(connection.edge))
    .find((candidate) => candidate !== null && edgeIds.includes(text(candidate.id) ?? "") &&
      candidate.sourceId === sourceId && candidate.targetId === errorId &&
      candidate.kind === "references" && candidate.resolution === "exact" &&
      record(candidate.evidence)?.ruleId === "module.commonjs-object-property-reference");
  const from = symbolReference(source);
  const to = symbolReference(error);
  const site = symbolLocation(edge);
  const declaration = symbolLocation(error);
  if (edge === undefined || from === null || to === null || site.length === 0 || declaration.length === 0) return [];
  return [
    "**Source-backed lead**",
    "",
    `- \`${from}\` → \`${to}\` (exact static property reference at \`${site}\`; declaration at \`${declaration}\`).`,
    "This cited source reference does not prove the rejection branch executes. Other ranked focuses are candidates; rank alone does not establish a path to this lead."
  ];
}

/** Renders the primary MCP explore result for agents and humans without diagnostic JSON. */
export function renderExploreText(value: Record<string, unknown>): string {
  const match = record(value.match);
  const queryPlan = record(value.queryPlan);
  const title = text(queryPlan?.query) ?? text(match?.reference) ?? "code graph";
  const sections: string[][] = [
    [`**Exploration: ${title}**`, "", renderStatus(value)],
    renderSourceBackedLead(value),
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
