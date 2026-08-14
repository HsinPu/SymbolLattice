import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

function parseArguments(argv) {
  const options = { manifest: undefined, receipts: undefined, output: undefined, selfTest: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--manifest") {
      options.manifest = resolve(argv[++index] ?? "");
      continue;
    }
    if (argument === "--receipts") {
      options.receipts = resolve(argv[++index] ?? "");
      continue;
    }
    if (argument === "--output") {
      options.output = resolve(argv[++index] ?? "");
      continue;
    }
    if (argument === "--self-test") {
      options.selfTest = true;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function record(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

function array(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  return value;
}

function string(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a nonempty string.`);
  }
  return value;
}

function boolean(value, label) {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean.`);
  }
  return value;
}

function nonnegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a nonnegative safe integer.`);
  }
  return value;
}

function unique(values, label) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) {
      throw new Error(`${label} contains a duplicate value: ${value}`);
    }
    seen.add(value);
  }
  return values;
}

function validateProtocol(value) {
  const protocol = record(value, "protocol");
  if (protocol.schemaVersion !== 1) {
    throw new Error("protocol.schemaVersion must be 1.");
  }
  const tasks = array(protocol.tasks, "protocol.tasks").map((value, index) => {
    const task = record(value, `protocol.tasks[${index}]`);
    return { id: string(task.id, `protocol.tasks[${index}].id`) };
  });
  unique(tasks.map((task) => task.id), "protocol.tasks.id");
  const isolation = record(protocol.isolation, "protocol.isolation");
  const stageAcceptance = record(protocol.stageAcceptance, "protocol.stageAcceptance");
  return {
    evaluationId: string(protocol.evaluationId, "protocol.evaluationId"),
    candidateDiffHash: string(
      record(protocol.product, "protocol.product").candidateDiffHash,
      "protocol.product.candidateDiffHash"
    ),
    taskIds: tasks.map((task) => task.id),
    requiredRuns: nonnegativeInteger(isolation.requiredRuns, "protocol.isolation.requiredRuns"),
    requiredContexts: nonnegativeInteger(
      stageAcceptance.requiredIndependentContexts,
      "protocol.stageAcceptance.requiredIndependentContexts"
    )
  };
}

const METRIC_FIELDS = Object.freeze([
  "elapsedMilliseconds",
  "inputTokens",
  "outputTokens",
  "toolCalls",
  "sourceFilesRead",
  "searchCalls",
  "graphCalls",
  "testRuns",
  "changedFiles",
  "changedLines"
]);

function validateReceipt(value, label, protocol) {
  const receipt = record(value, label);
  if (receipt.schemaVersion !== 1) {
    throw new Error(`${label}.schemaVersion must be 1.`);
  }
  const evaluationId = string(receipt.evaluationId, `${label}.evaluationId`);
  if (evaluationId !== protocol.evaluationId) {
    throw new Error(`${label}.evaluationId does not match the protocol.`);
  }
  const arm = string(receipt.arm, `${label}.arm`);
  if (arm !== "A" && arm !== "B") {
    throw new Error(`${label}.arm must be A or B.`);
  }
  const taskId = string(receipt.taskId, `${label}.taskId`);
  if (!protocol.taskIds.includes(taskId)) {
    throw new Error(`${label}.taskId is not declared by the protocol: ${taskId}`);
  }
  const candidateDiffHash = string(receipt.candidateDiffHash, `${label}.candidateDiffHash`);
  if (candidateDiffHash !== protocol.candidateDiffHash) {
    throw new Error(`${label}.candidateDiffHash does not match the frozen candidate.`);
  }
  const startedAt = Date.parse(string(receipt.startedAt, `${label}.startedAt`));
  const finishedAt = Date.parse(string(receipt.finishedAt, `${label}.finishedAt`));
  if (!Number.isFinite(startedAt) || !Number.isFinite(finishedAt) || finishedAt < startedAt) {
    throw new Error(`${label} has an invalid time interval.`);
  }
  const outcome = record(receipt.outcome, `${label}.outcome`);
  const criticalFailures = array(
    outcome.criticalFailures,
    `${label}.outcome.criticalFailures`
  ).map((value, index) => string(value, `${label}.outcome.criticalFailures[${index}]`));
  const taskSuccess = boolean(outcome.taskSuccess, `${label}.outcome.taskSuccess`);
  const reworkCycles = nonnegativeInteger(outcome.reworkCycles, `${label}.outcome.reworkCycles`);
  const metricsValue = record(receipt.metrics, `${label}.metrics`);
  const metrics = Object.fromEntries(
    METRIC_FIELDS.map((field) => [
      field,
      nonnegativeInteger(metricsValue[field], `${label}.metrics.${field}`)
    ])
  );
  const gates = array(receipt.gates, `${label}.gates`).map((value, index) => {
    const gate = record(value, `${label}.gates[${index}]`);
    return {
      name: string(gate.name, `${label}.gates[${index}].name`),
      passed: boolean(gate.passed, `${label}.gates[${index}].passed`),
      evidence: string(gate.evidence, `${label}.gates[${index}].evidence`)
    };
  });
  unique(gates.map((gate) => gate.name), `${label}.gates.name`);
  const toolTrace = array(receipt.toolTrace, `${label}.toolTrace`).map((value, index) => {
    const event = record(value, `${label}.toolTrace[${index}]`);
    return {
      tool: string(event.tool, `${label}.toolTrace[${index}].tool`).toLowerCase(),
      purpose: string(event.purpose, `${label}.toolTrace[${index}].purpose`)
    };
  });
  const changedPaths = unique(
    array(receipt.changedPaths, `${label}.changedPaths`).map((value, index) =>
      string(value, `${label}.changedPaths[${index}]`)
    ),
    `${label}.changedPaths`
  );
  const graphTools = toolTrace.filter((event) =>
    /symbol[- ]?lattice|\.symbol-lattice|explore|explain-edge|callers|callees|impact|context/u.test(
      event.tool
    )
  );
  const codeGraphTools = toolTrace.filter((event) => /codegraph/u.test(event.tool));
  if (codeGraphTools.length > 0) {
    throw new Error(`${label} used forbidden CodeGraph tooling.`);
  }
  if (arm === "A" && (metrics.graphCalls !== 0 || graphTools.length > 0)) {
    throw new Error(`${label} contaminated filesystem-only arm A with graph tooling.`);
  }
  if (metrics.toolCalls !== toolTrace.length) {
    throw new Error(`${label}.metrics.toolCalls must equal toolTrace.length.`);
  }
  if (taskSuccess && (criticalFailures.length > 0 || gates.some((gate) => !gate.passed))) {
    throw new Error(`${label} cannot claim taskSuccess with a critical failure or failed gate.`);
  }
  return {
    runId: string(receipt.runId, `${label}.runId`),
    taskId,
    arm,
    faultHash: string(receipt.faultHash, `${label}.faultHash`),
    contextId: string(receipt.contextId, `${label}.contextId`),
    model: string(receipt.model, `${label}.model`),
    reasoningEffort: string(receipt.reasoningEffort, `${label}.reasoningEffort`),
    candidateDiffHash,
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date(finishedAt).toISOString(),
    taskSuccess,
    criticalFailures,
    reworkCycles,
    metrics,
    gates,
    toolTrace,
    changedPaths
  };
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? ((ordered[middle - 1] ?? 0) + (ordered[middle] ?? 0)) / 2
    : (ordered[middle] ?? 0);
}

function summarizeArm(receipts, arm) {
  const runs = receipts.filter((receipt) => receipt.arm === arm);
  return {
    runs: runs.length,
    taskSuccesses: runs.filter((receipt) => receipt.taskSuccess).length,
    taskSuccessRate:
      runs.length === 0 ? 0 : runs.filter((receipt) => receipt.taskSuccess).length / runs.length,
    criticalFailures: runs.reduce(
      (total, receipt) => total + receipt.criticalFailures.length,
      0
    ),
    reworkCycles: runs.reduce((total, receipt) => total + receipt.reworkCycles, 0),
    metrics: Object.fromEntries(
      METRIC_FIELDS.map((field) => {
        const values = runs.map((receipt) => receipt.metrics[field]);
        return [
          field,
          {
            total: values.reduce((total, value) => total + value, 0),
            median: median(values)
          }
        ];
      })
    )
  };
}

function aggregate(protocolValue, receiptValues) {
  const protocol = validateProtocol(protocolValue);
  const receipts = receiptValues.map((value, index) =>
    validateReceipt(value, `receipts[${index}]`, protocol)
  );
  if (receipts.length !== protocol.requiredRuns) {
    throw new Error(`Expected ${protocol.requiredRuns} receipts, received ${receipts.length}.`);
  }
  unique(receipts.map((receipt) => receipt.runId), "receipts.runId");
  unique(receipts.map((receipt) => receipt.contextId), "receipts.contextId");
  if (new Set(receipts.map((receipt) => receipt.contextId)).size !== protocol.requiredContexts) {
    throw new Error(`Expected ${protocol.requiredContexts} independent contexts.`);
  }
  if (new Set(receipts.map((receipt) => receipt.model)).size !== 1) {
    throw new Error("All A/B runs must use the same model.");
  }
  if (new Set(receipts.map((receipt) => receipt.reasoningEffort)).size !== 1) {
    throw new Error("All A/B runs must use the same reasoning effort.");
  }
  for (const taskId of protocol.taskIds) {
    for (const arm of ["A", "B"]) {
      const matching = receipts.filter(
        (receipt) => receipt.taskId === taskId && receipt.arm === arm
      );
      if (matching.length !== 1) {
        throw new Error(`Expected exactly one ${arm} receipt for ${taskId}.`);
      }
    }
    const taskReceipts = receipts.filter((receipt) => receipt.taskId === taskId);
    if (new Set(taskReceipts.map((receipt) => receipt.faultHash)).size !== 1) {
      throw new Error(`A/B fault snapshots do not match for ${taskId}.`);
    }
  }
  const byArm = { A: summarizeArm(receipts, "A"), B: summarizeArm(receipts, "B") };
  const paired = protocol.taskIds.map((taskId) => {
    const a = receipts.find((receipt) => receipt.taskId === taskId && receipt.arm === "A");
    const b = receipts.find((receipt) => receipt.taskId === taskId && receipt.arm === "B");
    return {
      taskId,
      taskSuccess: { A: a.taskSuccess, B: b.taskSuccess },
      criticalFailures: { A: a.criticalFailures.length, B: b.criticalFailures.length },
      reworkDeltaBMinusA: b.reworkCycles - a.reworkCycles,
      elapsedDeltaBMinusA: b.metrics.elapsedMilliseconds - a.metrics.elapsedMilliseconds,
      tokenDeltaBMinusA:
        b.metrics.inputTokens + b.metrics.outputTokens -
        (a.metrics.inputTokens + a.metrics.outputTokens),
      toolCallDeltaBMinusA: b.metrics.toolCalls - a.metrics.toolCalls
    };
  });
  return {
    schemaVersion: 1,
    evaluationId: protocol.evaluationId,
    generatedAt: new Date().toISOString(),
    candidateDiffHash: protocol.candidateDiffHash,
    model: receipts[0]?.model,
    reasoningEffort: receipts[0]?.reasoningEffort,
    validIndependentReceipts: receipts.length,
    byArm,
    paired,
    receipts,
    interpretation:
      byArm.B.taskSuccessRate > byArm.A.taskSuccessRate
        ? "symbol-lattice-higher-observed-success"
        : byArm.B.taskSuccessRate < byArm.A.taskSuccessRate
          ? "symbol-lattice-lower-observed-success"
          : "equal-observed-success",
    causalClaimAllowed: false,
    causalClaimReason:
      "This paired repository benchmark reports observed outcomes; it does not establish broad causal effects outside the fixed tasks, model, and candidate."
  };
}

function syntheticReceipt(taskId, arm, ordinal) {
  const start = Date.parse("2026-08-14T00:00:00.000Z") + ordinal * 60_000;
  const tools = arm === "A"
    ? [{ tool: "read-file", purpose: "inspect source" }]
    : [
        { tool: "symbol-lattice explore", purpose: "retrieve graph context" },
        { tool: "read-file", purpose: "inspect source" }
      ];
  return {
    schemaVersion: 1,
    evaluationId: "typescript-self-hosting-ai-ab-v1",
    runId: `${arm}${taskId.at(-1)}`,
    taskId,
    arm,
    contextId: `context-${arm}-${taskId}`,
    model: "test-model",
    reasoningEffort: "test-effort",
    candidateDiffHash: "candidate-hash",
    faultHash: `fault-${taskId}`,
    startedAt: new Date(start).toISOString(),
    finishedAt: new Date(start + 10_000).toISOString(),
    outcome: { taskSuccess: true, criticalFailures: [], reworkCycles: 0 },
    metrics: {
      elapsedMilliseconds: 10_000,
      inputTokens: 100,
      outputTokens: 50,
      toolCalls: tools.length,
      sourceFilesRead: 1,
      searchCalls: 0,
      graphCalls: arm === "A" ? 0 : 1,
      testRuns: 1,
      changedFiles: 1,
      changedLines: 2
    },
    gates: [{ name: "focused", passed: true, evidence: "pass" }],
    toolTrace: tools,
    changedPaths: ["src/example.ts"]
  };
}

function runSelfTest() {
  const protocol = {
    schemaVersion: 1,
    evaluationId: "typescript-self-hosting-ai-ab-v1",
    product: { candidateDiffHash: "candidate-hash" },
    tasks: [1, 2, 3, 4].map((ordinal) => ({ id: `TS-AB-0${ordinal}` })),
    isolation: { requiredRuns: 8 },
    stageAcceptance: { requiredIndependentContexts: 8 }
  };
  const receipts = protocol.tasks.flatMap((task, index) => [
    syntheticReceipt(task.id, "A", index * 2),
    syntheticReceipt(task.id, "B", index * 2 + 1)
  ]);
  const result = aggregate(protocol, receipts);
  if (
    result.validIndependentReceipts !== 8 ||
    result.byArm.A.taskSuccesses !== 4 ||
    result.byArm.B.taskSuccesses !== 4
  ) {
    throw new Error("Self-test aggregate mismatch.");
  }
  const contaminated = structuredClone(receipts);
  contaminated[0].metrics.graphCalls = 1;
  let rejected = false;
  try {
    aggregate(protocol, contaminated);
  } catch (error) {
    rejected = error instanceof Error && error.message.includes("contaminated");
  }
  if (!rejected) {
    throw new Error("Self-test failed to reject contaminated arm A receipt.");
  }
  process.stdout.write(`${JSON.stringify({ selfTest: "PASS", receipts: 8 })}\n`);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.selfTest) {
    runSelfTest();
    return;
  }
  if (options.manifest === undefined || options.receipts === undefined || options.output === undefined) {
    throw new Error("--manifest, --receipts, and --output are required unless --self-test is used.");
  }
  const protocol = JSON.parse(await readFile(options.manifest, "utf8"));
  const receiptPaths = (await readdir(options.receipts, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => resolve(options.receipts, entry.name))
    .sort();
  const receipts = await Promise.all(
    receiptPaths.map(async (receiptPath) => JSON.parse(await readFile(receiptPath, "utf8")))
  );
  const result = aggregate(protocol, receipts);
  await writeFile(options.output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  process.stdout.write(
    `${JSON.stringify({ output: options.output, receipts: receipts.length, byArm: result.byArm })}\n`
  );
}

await main();
