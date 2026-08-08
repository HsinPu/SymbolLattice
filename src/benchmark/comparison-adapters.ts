const ANSI_SEQUENCE = /\u001B\[[0-?]*[ -/]*[@-~]/gu;
const CALLABLE_KINDS = new Set(["function", "method"]);

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function canonicalCalls(source: string, targets: Iterable<string>): readonly string[] {
  return [...new Set([...targets].map((target) => `calls|${source}|${target}`))]
    .sort((left, right) => left.localeCompare(right, "en"));
}

/** Converts SymbolLattice's stable node or callees JSON contract into bounded canonical call relations. */
export function parseSymbolLatticeCallees(output: string, source: string): readonly string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch (error) {
    throw new Error(`SymbolLattice returned invalid JSON: ${String(error)}`);
  }
  const root = record(parsed);
  if (root === null) {
    throw new Error("SymbolLattice returned a non-object JSON response.");
  }
  const failure = record(root?.error);
  if (failure !== null) {
    throw new Error(`SymbolLattice query failed: ${String(failure.message ?? failure.code ?? "unknown error")}`);
  }
  const match = record(root?.match);
  const selectedSymbol = record(root?.symbol);
  const callees = record(root?.callees);
  const ranking = record(root?.ranking);
  const nodeContract = match?.status === "exact" && callees !== null && Array.isArray(callees.items);
  const calleesContract = selectedSymbol?.name === source && Array.isArray(root?.relations);
  if (!nodeContract && !calleesContract) {
    throw new Error(`SymbolLattice did not return one exact callees contract for ${source}.`);
  }
  if (callees?.truncated === true || ranking?.truncated === true) {
    throw new Error(`SymbolLattice callees for ${source} were truncated.`);
  }

  const targets: string[] = [];
  const relations = nodeContract ? callees.items : root.relations;
  for (const itemValue of relations as readonly unknown[]) {
    const item = record(itemValue);
    const symbol = record(item?.symbol);
    const edge = record(item?.edge);
    if (
      edge?.kind === "calls" &&
      typeof symbol?.kind === "string" &&
      CALLABLE_KINDS.has(symbol.kind) &&
      typeof symbol.name === "string" &&
      symbol.name.length > 0
    ) {
      targets.push(symbol.name);
    }
  }
  return canonicalCalls(source, targets);
}

/** Converts CodeGraph's human CLI `callees` table into the same canonical call relations. */
export function parseCodeGraphCallees(output: string, source: string): readonly string[] {
  const plain = output.replace(ANSI_SEQUENCE, "");
  if (plain.trimStart().startsWith("{")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(plain);
    } catch (error) {
      throw new Error(`CodeGraph returned invalid JSON: ${String(error)}`);
    }
    const root = record(parsed);
    if (root?.symbol !== source || !Array.isArray(root.callees)) {
      throw new Error(`CodeGraph JSON for ${source} omitted its exact callees contract.`);
    }
    const targets: string[] = [];
    for (const value of root.callees) {
      const callee = record(value);
      if (
        typeof callee?.kind === "string" &&
        CALLABLE_KINDS.has(callee.kind) &&
        typeof callee.name === "string" &&
        callee.name.length > 0
      ) {
        targets.push(callee.name);
      }
    }
    return canonicalCalls(source, targets);
  }
  if (/not found/iu.test(plain)) {
    throw new Error(`CodeGraph symbol ${source} was not found.`);
  }
  if (/multiple symbols|ambiguous/iu.test(plain)) {
    throw new Error(`CodeGraph symbol ${source} was ambiguous.`);
  }
  const header = /Callees of\s+"[^"]+"\s+\((\d+)\):/u.exec(plain);
  if (header?.[1] === undefined) {
    throw new Error(`CodeGraph output for ${source} omitted the callees header.`);
  }
  const declaredCount = Number(header[1]);
  const rows: { readonly kind: string; readonly name: string }[] = [];
  for (const line of plain.split(/\r?\n/u)) {
    const row = /^([a-z][a-z0-9_]*)\s{2,}(.+?)\s*$/u.exec(line.trimEnd());
    if (row?.[1] !== undefined && row[2] !== undefined) {
      rows.push({ kind: row[1], name: row[2].trim() });
    }
  }
  if (rows.length !== declaredCount) {
    throw new Error(
      `CodeGraph declared ${declaredCount} relations but emitted ${rows.length} parseable rows for ${source}.`
    );
  }
  return canonicalCalls(
    source,
    rows.filter((row) => CALLABLE_KINDS.has(row.kind)).map((row) => row.name)
  );
}
