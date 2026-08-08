import {
  INDEX_PERFORMANCE_PHASE_NAMES,
  INDEX_PERFORMANCE_POLICY,
  type IndexOperationPerformance,
  type IndexPerformancePhaseName
} from "../domain/index-work.js";

const ANSI_SEQUENCE = /\u001B\[[0-?]*[ -/]*[@-~]/gu;
const CALLABLE_KINDS = new Set(["function", "method"]);
const INDEX_PERFORMANCE_PHASES = new Set<string>(INDEX_PERFORMANCE_PHASE_NAMES);

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function canonicalCalls(source: string, targets: Iterable<string>): readonly string[] {
  return [...new Set([...targets].map((target) => `calls|${source}|${target}`))]
    .sort((left, right) => left.localeCompare(right, "en"));
}

function nonnegativeFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** Fail-closed adapter for SymbolLattice's process-local index/sync timing receipt. */
export function parseSymbolLatticeIndexPerformance(
  output: string,
  operation: IndexOperationPerformance["operation"]
): IndexOperationPerformance {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch (error) {
    throw new Error(`SymbolLattice returned invalid performance JSON: ${String(error)}`);
  }
  const root = record(parsed);
  const receipt = record(root?.operationPerformance);
  if (
    receipt?.policy !== INDEX_PERFORMANCE_POLICY ||
    receipt.operation !== operation ||
    receipt.clock !== "monotonic-milliseconds" ||
    !Array.isArray(receipt.phases)
  ) {
    throw new Error(`SymbolLattice omitted the ${operation} operation performance receipt.`);
  }

  const seen = new Set<string>();
  const phases = receipt.phases.map((value, index) => {
    const phase = record(value);
    if (
      phase === null ||
      typeof phase.name !== "string" ||
      !INDEX_PERFORMANCE_PHASES.has(phase.name) ||
      !nonnegativeFinite(phase.durationMs)
    ) {
      throw new Error(`SymbolLattice returned an invalid performance phase at index ${index}.`);
    }
    if (seen.has(phase.name)) {
      throw new Error(`SymbolLattice returned a duplicate phase: ${phase.name}.`);
    }
    seen.add(phase.name);
    return {
      name: phase.name as IndexPerformancePhaseName,
      durationMs: phase.durationMs
    };
  });
  if (
    !nonnegativeFinite(receipt.totalDurationMs) ||
    !nonnegativeFinite(receipt.measuredDurationMs) ||
    !nonnegativeFinite(receipt.unattributedDurationMs)
  ) {
    throw new Error("SymbolLattice returned invalid performance duration totals.");
  }
  const phaseDuration = phases.reduce((total, phase) => total + phase.durationMs, 0);
  if (Math.abs(phaseDuration - receipt.measuredDurationMs) > 0.002) {
    throw new Error("SymbolLattice measured duration does not equal its phase durations.");
  }
  if (
    receipt.totalDurationMs + 0.002 < receipt.measuredDurationMs ||
    Math.abs(
      receipt.totalDurationMs - receipt.measuredDurationMs - receipt.unattributedDurationMs
    ) > 0.002
  ) {
    throw new Error("SymbolLattice total duration does not reconcile with measured and unattributed time.");
  }
  return {
    policy: INDEX_PERFORMANCE_POLICY,
    operation,
    clock: "monotonic-milliseconds",
    phases,
    totalDurationMs: receipt.totalDurationMs,
    measuredDurationMs: receipt.measuredDurationMs,
    unattributedDurationMs: receipt.unattributedDurationMs
  };
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
