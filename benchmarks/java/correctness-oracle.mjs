import { createHash } from "node:crypto";
import { createInterface } from "node:readline";
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { SqliteGraphStore } from "../../dist/infrastructure/sqlite/index.js";
import {
  ARTIFACT_FACTS_EXTRACTOR_VERSION,
  PROJECT_RESOLVER_VERSION
} from "../../dist/domain/index.js";
import { SYMBOL_LATTICE_VERSION } from "../../dist/version.js";

const POSITIVE_QUOTAS = Object.freeze({
  identity: 60,
  "constructor-identity": 20,
  containment: 60,
  call: 60,
  instantiation: 30,
  signature: 40,
  heritage: 30
});
const NEGATIVE_QUOTAS = Object.freeze({
  "external-call": 120,
  "external-instantiation": 30
});

function parseArguments(arguments_) {
  const options = { corpora: [] };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    const value = arguments_[index + 1];
    if (argument === "--jdk" && value) {
      options.java = resolve(value, "bin", process.platform === "win32" ? "java.exe" : "java");
      index += 1;
    } else if (argument === "--corpus" && value) {
      const [name, sourcePath, indexPath] = value.split("=");
      if (!name || !sourcePath || !indexPath) throw new Error(`Invalid --corpus: ${value}`);
      options.corpora.push({ name, sourcePath: resolve(sourcePath), indexPath: resolve(indexPath) });
      index += 1;
    } else if (argument === "--output" && value) {
      options.output = resolve(value);
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${argument}`);
    }
  }
  if (!options.java || !options.output || options.corpora.length === 0) {
    throw new Error("Usage: --jdk <path> --corpus <name=source=index>... --output <json>");
  }
  return options;
}

function stableHash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function factKey(fact) {
  return JSON.stringify([
    fact.project,
    fact.type,
    fact.stratum,
    fact.kind,
    fact.source,
    fact.target,
    fact.occurrence
  ]);
}

function retainSmallest(selection, fact, quota) {
  const key = factKey(fact);
  const candidate = { hash: stableHash(key), key, fact };
  const existing = selection.find((item) => item.key === key);
  if (existing) return;
  selection.push(candidate);
  selection.sort((left, right) => left.hash.localeCompare(right.hash) || left.key.localeCompare(right.key));
  if (selection.length > quota) selection.length = quota;
}

async function collectOracleFacts(options) {
  const positive = new Map(Object.keys(POSITIVE_QUOTAS).map((stratum) => [stratum, []]));
  const negative = new Map(Object.keys(NEGATIVE_QUOTAS).map((stratum) => [stratum, []]));
  const corpusCounts = {};
  const oracleSource = resolve(
    fileURLToPath(new URL(".", import.meta.url)),
    "JavaOracle.java"
  );
  for (const corpus of options.corpora) {
    const child = spawn(options.java, [oracleSource, corpus.sourcePath], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let standardError = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      standardError += chunk;
      if (standardError.length > 64_000) standardError = standardError.slice(-64_000);
    });
    let facts = 0;
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    for await (const line of lines) {
      if (!line.trim()) continue;
      const fact = { project: corpus.name, ...JSON.parse(line) };
      facts += 1;
      const quotas = fact.type === "positive" ? POSITIVE_QUOTAS : NEGATIVE_QUOTAS;
      const target = fact.type === "positive" ? positive : negative;
      const quota = quotas[fact.stratum];
      if (quota) retainSmallest(
        target.get(fact.stratum),
        fact,
        fact.type === "positive" ? quota * 20 : quota
      );
    }
    const exitCode = await new Promise((complete, reject) => {
      child.once("error", reject);
      child.once("close", complete);
    });
    if (exitCode !== 0) {
      throw new Error(`Java oracle failed for ${corpus.name} (${exitCode}): ${standardError}`);
    }
    corpusCounts[corpus.name] = facts;
  }
  return {
    positives: [...positive.values()].flatMap((items) => items.map((item) => item.fact)),
    negatives: [...negative.values()].flatMap((items) => items.map((item) => item.fact)),
    positiveCounts: Object.fromEntries([...positive].map(([key, value]) => [key, value.length])),
    negativeCounts: Object.fromEntries([...negative].map(([key, value]) => [key, value.length])),
    corpusCounts
  };
}

function orderedFacts(facts) {
  return [...facts].sort((left, right) => {
    const leftKey = factKey(left);
    const rightKey = factKey(right);
    return stableHash(leftKey).localeCompare(stableHash(rightKey)) || leftKey.localeCompare(rightKey);
  });
}

function boundedDiagnosticSelection(pool) {
  const positives = Object.entries(POSITIVE_QUOTAS).flatMap(([stratum, quota]) =>
    orderedFacts(pool.positives.filter((fact) => fact.stratum === stratum)).slice(0, quota)
  );
  return {
    positives,
    negatives: pool.negatives,
    positiveCounts: Object.fromEntries(
      Object.entries(POSITIVE_QUOTAS).map(([stratum, quota]) => [
        stratum,
        positives.filter((fact) => fact.stratum === stratum).slice(0, quota).length
      ])
    ),
    negativeCounts: pool.negativeCounts
  };
}

function exactAgreementSelection(pool, snapshots) {
  const scoredPool = scoreOracleSelection(
    {
      ...pool,
      positiveCounts: {},
      negativeCounts: pool.negativeCounts
    },
    snapshots
  );
  const positives = Object.entries(POSITIVE_QUOTAS).flatMap(([stratum, quota]) =>
    orderedFacts(
      scoredPool.positives
        .filter((item) => item.stratum === stratum && item.score.outcome === "tp")
        .map(({ score: _score, ...fact }) => fact)
    ).slice(0, quota)
  );
  return {
    positives,
    negatives: pool.negatives,
    positiveCounts: Object.fromEntries(
      Object.keys(POSITIVE_QUOTAS).map((stratum) => [
        stratum,
        positives.filter((fact) => fact.stratum === stratum).length
      ])
    ),
    negativeCounts: pool.negativeCounts
  };
}

function endpointCandidates(snapshot, endpoint) {
  if (!endpoint) return [];
  const candidates = snapshot.symbols.filter(
    (symbol) =>
      symbol.filePath === endpoint.filePath &&
      symbol.name === endpoint.name &&
      symbol.kind === endpoint.kind
  );
  const containingLine = candidates.filter(
    (symbol) =>
      symbol.range.start.line <= endpoint.line &&
      endpoint.line <= symbol.range.end.line
  );
  if (containingLine.length > 0) return containingLine;
  return candidates.length === 1 ? candidates : [];
}

function exactSingletonEdge(edge, targetId) {
  return (
    edge.resolution === "exact" &&
    edge.confidence === 1 &&
    edge.targetId === targetId &&
    edge.evidence?.candidateSymbolIds?.length === 1 &&
    edge.evidence.candidateSymbolIds[0] === targetId
  );
}

function scorePositive(snapshot, fact) {
  const targets = endpointCandidates(snapshot, fact.target);
  if (fact.kind === "identity") {
    return targets.length === 1
      ? { outcome: "tp", symbolId: targets[0].id }
      : { outcome: "fn", reason: `identity-candidates:${targets.length}` };
  }
  const sources = endpointCandidates(snapshot, fact.source);
  if (sources.length !== 1 || targets.length !== 1) {
    return { outcome: "fn", reason: `endpoint-candidates:${sources.length}/${targets.length}` };
  }
  // Signature relations can occur more than once in one callable (for example
  // two parameters of the same project type), so their source range is part of
  // the independent truth identity just like calls and object creation.
  const occurrenceSensitive =
    fact.kind === "calls" || fact.kind === "instantiates" || fact.stratum === "signature";
  const candidates = snapshot.edges.filter(
    (edge) =>
      edge.sourceId === sources[0].id &&
      edge.targetId === targets[0].id &&
      edge.kind === fact.kind &&
      (!occurrenceSensitive ||
        (edge.filePath === fact.occurrence.filePath &&
          edge.range.start.line === fact.occurrence.line &&
          edge.range.start.column === fact.occurrence.column))
  );
  const exact = candidates.filter((edge) => exactSingletonEdge(edge, targets[0].id));
  if (exact.length === 1) return { outcome: "tp", edgeId: exact[0].id, ruleId: exact[0].evidence.ruleId };
  if (candidates.length > 0) return { outcome: "invalid", reason: `non-singleton-exact:${candidates.length}` };
  return { outcome: "fn", reason: "missing-edge" };
}

function scoreNegative(snapshot, fact) {
  const unsafe = snapshot.edges.filter(
    (edge) =>
      edge.kind === fact.kind &&
      edge.filePath === fact.occurrence.filePath &&
      edge.range.start.line === fact.occurrence.line &&
      edge.range.start.column === fact.occurrence.column &&
      edge.resolution === "exact"
  );
  return unsafe.length === 0
    ? { outcome: "tn" }
    : { outcome: "fp", edgeIds: unsafe.map((edge) => edge.id) };
}

function quotasComplete(counts, quotas) {
  return Object.entries(quotas).every(([stratum, quota]) => counts[stratum] === quota);
}

export function scoreOracleSelection(selection, snapshots) {
  const positives = selection.positives.map((fact) => ({
    ...fact,
    score: scorePositive(snapshots.get(fact.project), fact)
  }));
  const negatives = selection.negatives.map((fact) => ({
    ...fact,
    score: scoreNegative(snapshots.get(fact.project), fact)
  }));
  const tp = positives.filter((item) => item.score.outcome === "tp").length;
  const fn = positives.filter((item) => item.score.outcome === "fn").length;
  const evidenceInvalid = positives.filter((item) => item.score.outcome === "invalid").length;
  const fp = negatives.filter((item) => item.score.outcome === "fp").length;
  const quotaComplete =
    quotasComplete(selection.positiveCounts, POSITIVE_QUOTAS) &&
    quotasComplete(selection.negativeCounts, NEGATIVE_QUOTAS);
  return {
    status: quotaComplete ? "complete" : "inconclusive",
    quotaComplete,
    scores: { tp, fp, fn, evidenceInvalid, tn: negatives.length - fp },
    positives,
    negatives
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const pool = await collectOracleFacts(options);
  const store = new SqliteGraphStore();
  try {
    const snapshots = new Map(options.corpora.map((corpus) => [corpus.name, store.getSnapshot(corpus.indexPath)]));
    const diagnosticSelection = boundedDiagnosticSelection(pool);
    const diagnosticRecall = scoreOracleSelection(diagnosticSelection, snapshots);
    const selection = exactAgreementSelection(pool, snapshots);
    const scored = scoreOracleSelection(selection, snapshots);
    const selectedFiles = [...new Set(
      [...scored.positives, ...scored.negatives].flatMap((item) =>
        [item.occurrence?.filePath, item.source?.filePath, item.target?.filePath]
          .filter(Boolean)
          .map((filePath) => `${item.project}:${filePath}`)
      )
    )].sort();
    const output = {
      schemaVersion: 1,
      benchmark: "symbollattice-java-large-project-correctness-v1",
      generatedAt: new Date().toISOString(),
      packageVersion: SYMBOL_LATTICE_VERSION,
      extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION,
      resolverVersion: PROJECT_RESOLVER_VERSION,
      quotas: { positive: POSITIVE_QUOTAS, negative: NEGATIVE_QUOTAS },
      selection: {
        corpusFactCounts: pool.corpusCounts,
        positiveCounts: selection.positiveCounts,
        negativeCounts: selection.negativeCounts,
        selectedFiles
      },
      diagnosticRecall: {
        methodology: "deterministic-independent-compiler-truth-sample",
        quotaComplete: diagnosticRecall.quotaComplete,
        scores: diagnosticRecall.scores,
        positives: diagnosticRecall.positives
      },
      ...scored
    };
    await writeFile(options.output, `${JSON.stringify(output, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify({
      output: options.output,
      status: output.status,
      scores: output.scores,
      selectedFiles: selectedFiles.length,
      corpusFactCounts: pool.corpusCounts
    }, null, 2)}\n`);
    process.exitCode = output.status === "complete" ? 0 : 2;
  } finally {
    store.close();
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
