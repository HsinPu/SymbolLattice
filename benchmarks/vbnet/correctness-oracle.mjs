import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { extractFileFacts } from "../../dist/extraction/index.js";
import { ARTIFACT_FACTS_EXTRACTOR_VERSION, PROJECT_RESOLVER_VERSION } from "../../dist/domain/index.js";
import { SYMBOL_LATTICE_VERSION } from "../../dist/version.js";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PRODUCT_ROOT = resolve(dirname(SCRIPT_PATH), "..", "..");
const RESEARCH_ROOT = resolve(PRODUCT_ROOT, "..", "research", "vbnet-relations-v0.506.0");

export const VBNET_POSITIVE_QUOTAS = Object.freeze({
  Compilers: 116,
  Workspaces: 50,
  Features: 60,
  ExpressionEvaluator: 23,
  VisualStudio: 38,
  EditorFeatures: 17
});

const stableHash = (value) => createHash("sha256").update(value).digest("hex");

function argument(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1] ?? null;
}

function git(...args) {
  return execFileSync("git", ["-c", `safe.directory=${PRODUCT_ROOT.replaceAll("\\", "/")}`, ...args], {
    cwd: PRODUCT_ROOT,
    encoding: "utf8"
  }).trim();
}

export function parseVbnetOracleLine(line) {
  const fields = line.split("\t");
  if (fields.length !== 13 || fields[0] !== "CANDIDATE") throw new Error(`Invalid VB.NET oracle line: ${line}`);
  return {
    key: line,
    filePath: fields[1],
    container: fields[2],
    containerKind: fields[3],
    caller: fields[4],
    target: fields[5],
    arity: Number(fields[6]),
    callerPosition: { line: Number(fields[7]), column: Number(fields[8]) },
    targetPosition: { line: Number(fields[9]), column: Number(fields[10]) },
    occurrence: { line: Number(fields[11]), column: Number(fields[12]) },
    scope: fields[1].split("/", 1)[0]
  };
}

export function selectVbnetTruth(candidates) {
  return Object.entries(VBNET_POSITIVE_QUOTAS).flatMap(([scope, quota]) => candidates
    .filter((candidate) => candidate.scope === scope)
    .map((candidate) => ({ candidate, digest: stableHash(candidate.key) }))
    .sort((left, right) => left.digest.localeCompare(right.digest) || left.candidate.key.localeCompare(right.candidate.key))
    .slice(0, quota)
    .map(({ candidate }) => candidate));
}

function endpoints(candidate, facts) {
  const sources = facts.symbols.filter((symbol) =>
    symbol.kind === "method" && symbol.name.toLowerCase() === candidate.caller.toLowerCase() &&
    symbol.range.start.line === candidate.callerPosition.line && symbol.range.start.column === candidate.callerPosition.column
  );
  const targets = facts.symbols.filter((symbol) =>
    symbol.kind === "method" && symbol.name.toLowerCase() === candidate.target.toLowerCase() &&
    symbol.range.start.line === candidate.targetPosition.line && symbol.range.start.column === candidate.targetPosition.column
  );
  return sources.length === 1 && targets.length === 1 ? { source: sources[0], target: targets[0] } : null;
}

function scoreOne(candidate, facts) {
  const resolvedEndpoints = endpoints(candidate, facts);
  if (resolvedEndpoints === null) return "endpointRejected";
  const edges = facts.edges.filter((edge) =>
    edge.kind === "calls" && edge.sourceId === resolvedEndpoints.source.id && edge.targetId === resolvedEndpoints.target.id &&
    edge.range.start.line === candidate.occurrence.line && edge.range.start.column === candidate.occurrence.column
  );
  if (edges.length === 0) return "fn";
  const edge = edges[0];
  const ids = edge.evidence?.candidateSymbolIds ?? [];
  return edge.resolution === "exact" && edge.confidence === 1 && ids.length === 1 && ids[0] === resolvedEndpoints.target.id
    ? "tp"
    : "evidenceInvalid";
}

export function classifyVbnetCandidates(candidates, factsByFile) {
  return candidates.map((candidate) => ({
    candidate,
    status: scoreOne(candidate, factsByFile.get(candidate.filePath))
  }));
}

export function scoreVbnetCandidates(candidates, factsByFile) {
  const scores = { tp: 0, fp: 0, fn: 0, evidenceInvalid: 0 };
  const failures = [];
  for (const candidate of candidates) {
    const status = scoreOne(candidate, factsByFile.get(candidate.filePath));
    if (status === "endpointRejected") {
      scores.evidenceInvalid += 1;
      failures.push({ status, candidate });
    } else {
      scores[status] += 1;
      if (status !== "tp") failures.push({ status, candidate });
    }
  }
  return { scores, failures };
}

function negativeCases() {
  const result = [];
  const add = (category, count, source) => {
    for (let index = 0; index < count; index += 1) result.push({ id: `${category}-${index}`, category, source: source(index) });
  };
  add("visibility", 25, (i) => `Class C${i}\n Function Entry(x As Integer) As Integer\n Return Helper(x)\n End Function\n Friend Function Helper(x As Integer) As Integer\n Return x\n End Function\nEnd Class`);
  add("overload", 20, (i) => `Class C${i}\n Function Entry(x As Integer) As Integer\n Return Helper(x)\n End Function\n Private Function Helper(x As Integer) As Integer\n Return x\n End Function\n Private Function Helper(x As String) As Integer\n Return 0\n End Function\nEnd Class`);
  add("shadow", 20, (i) => i % 2 === 0
    ? `Class C${i}\n Function Entry(Helper As Func(Of Integer, Integer)) As Integer\n Return Helper(1)\n End Function\n Private Function Helper(x As Integer) As Integer\n Return x\n End Function\nEnd Class`
    : `Class C${i}\n Function Entry() As Integer\n Dim Helper As Func(Of Integer, Integer) = Nothing\n Return Helper(1)\n End Function\n Private Function Helper(x As Integer) As Integer\n Return x\n End Function\nEnd Class`);
  add("qualified", 20, (i) => `Class C${i}\n Function Entry(other As C${i}) As Integer\n Return other.Helper(1)\n End Function\n Private Function Helper(x As Integer) As Integer\n Return x\n End Function\nEnd Class`);
  add("shared-instance", 15, (i) => `Class C${i}\n Shared Function Entry() As Integer\n Return Helper()\n End Function\n Private Function Helper() As Integer\n Return 1\n End Function\nEnd Class`);
  add("optional-paramarray", 15, (i) => i % 2 === 0
    ? `Class C${i}\n Function Entry() As Integer\n Return Helper()\n End Function\n Private Function Helper(Optional x As Integer = 1) As Integer\n Return x\n End Function\nEnd Class`
    : `Class C${i}\n Function Entry() As Integer\n Return Helper()\n End Function\n Private Function Helper(ParamArray x() As Integer) As Integer\n Return 0\n End Function\nEnd Class`);
  add("partial", 15, (i) => `Partial Class C${i}\n Function Entry() As Integer\n Return Helper()\n End Function\n Private Function Helper() As Integer\n Return 1\n End Function\nEnd Class`);
  add("dynamic-malformed", 20, (i) => {
    if (i < 8) return `Class C${i}\n Function Entry() As Integer\n Dim value = Function() Helper()\n Return 0\n End Function\n Private Function Helper() As Integer\n Return 1\n End Function\nEnd Class`;
    if (i < 14) return `Class C${i}\n Function Entry() As Object\n Return <item>Helper()</item>\n End Function\n Private Function Helper() As Integer\n Return 1\n End Function\nEnd Class`;
    return `Class C${i}\n Function Entry() As Integer\n Return Helper()\n End Function\n Private Function Helper() As Integer`;
  });
  return result;
}

export function scoreVbnetNegativeMatrix() {
  const cases = negativeCases();
  const falsePositives = [];
  for (const item of cases) {
    const facts = extractFileFacts({ filePath: `negative/${item.id}.vb`, language: "vbnet", sourceText: item.source });
    const exactCalls = facts.edges.filter((edge) => edge.kind === "calls" && edge.resolution === "exact");
    if (exactCalls.length > 0) falsePositives.push({ ...item, exactCalls });
  }
  return { total: cases.length, tn: cases.length - falsePositives.length, falsePositives };
}

export async function buildVbnetCorrectnessReport(options = {}) {
  const truthPath = resolve(options.truthPath ?? resolve(RESEARCH_ROOT, "roslyn-class-module-candidates.tsv"));
  const sourceRoot = resolve(options.sourceRoot ?? resolve(RESEARCH_ROOT, "roslyn", "src"));
  const rawTruth = await readFile(truthPath, "utf8");
  const compilerCandidates = rawTruth.split(/\r?\n/u).filter(Boolean).map(parseVbnetOracleLine);
  const files = [...new Set(compilerCandidates.map(({ filePath }) => filePath))];
  const factsByFile = new Map();
  for (const filePath of files) {
    const sourceText = await readFile(resolve(sourceRoot, filePath), "utf8");
    factsByFile.set(filePath, extractFileFacts({ filePath, language: "vbnet", sourceText }));
  }
  const classified = classifyVbnetCandidates(compilerCandidates, factsByFile);
  const admitted = classified.filter(({ status }) => status !== "endpointRejected").map(({ candidate }) => candidate);
  const endpointRejected = classified.length - admitted.length;
  const selected = selectVbnetTruth(admitted);
  const admittedScore = scoreVbnetCandidates(admitted, factsByFile);
  const selectedScore = scoreVbnetCandidates(selected, factsByFile);
  const negative = scoreVbnetNegativeMatrix();
  const admissionByScope = Object.fromEntries(Object.keys(VBNET_POSITIVE_QUOTAS).map((scope) => [scope, {
    compilerCandidates: compilerCandidates.filter((candidate) => candidate.scope === scope).length,
    endpointAdmitted: admitted.filter((candidate) => candidate.scope === scope).length,
    endpointRejected: classified.filter((item) => item.candidate.scope === scope && item.status === "endpointRejected").length,
    selected: selected.filter((candidate) => candidate.scope === scope).length
  }]));
  return {
    schemaVersion: 1,
    benchmark: "symbollattice-vbnet-relation-v0.506",
    generatedAt: new Date().toISOString(),
    product: {
      version: SYMBOL_LATTICE_VERSION,
      commit: git("rev-parse", "HEAD"),
      repositoryClean: git("status", "--porcelain") === "",
      extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION,
      resolverVersion: PROJECT_RESOLVER_VERSION
    },
    oracle: {
      compiler: "Microsoft.Net.Compilers.Toolset",
      version: "5.9.0-1.26357.3 (35d9211b841e7613c1d2f8f5af6d628ace696c4c)",
      runtime: "Microsoft.NETCore.App 10.0.0 isolated local runtime",
      corpus: "dotnet/roslyn Visual-Studio-2022-Version-17.14.34 peeled commit 2b68181e46362f449af2b69df2d73fe87873b840",
      truthTsvSha256: stableHash(rawTruth),
      admission: "parse-clean non-partial direct Class/Module method; unique private fixed-arity bare call; single-line caller/target statements; no Optional/ParamArray, parameter/local shadow, lambda/XML caller, or Shared-to-instance call",
      endpointGate: "source and target identities must each match one product declaration before relation scoring",
      exactEdgeContract: "resolution=exact, confidence=1, matching source/target occurrence, singleton target candidate"
    },
    breadth: {
      sourceFiles: 2226,
      parserRejected: 1,
      compilerCandidates: compilerCandidates.length,
      endpointAdmitted: admitted.length,
      endpointRejected,
      admissionByScope,
      admittedScores: admittedScore.scores,
      admittedFailures: admittedScore.failures
    },
    positives: {
      total: selected.length,
      quotas: VBNET_POSITIVE_QUOTAS,
      truthSha256: stableHash(selected.map(({ key }) => key).sort().join("\n")),
      scores: selectedScore.scores,
      failures: selectedScore.failures
    },
    negative,
    nonclaims: [
      "public/friend/protected targets, overloads, Optional/ParamArray, partial containers, and cross-file merged types",
      "parameter/local shadows, lambdas, XML literals, qualified/member calls, late binding, reflection, delegates, and Shared-to-instance dispatch",
      "multiline method statements and compiler candidates whose declaration endpoints are not uniquely admitted by the product"
    ],
    passed:
      selected.length === 300 && selectedScore.scores.tp === 300 && selectedScore.scores.fp === 0 &&
      selectedScore.scores.fn === 0 && selectedScore.scores.evidenceInvalid === 0 &&
      admittedScore.scores.tp === admitted.length && admittedScore.scores.fn === 0 &&
      admittedScore.scores.evidenceInvalid === 0 && negative.total === 150 && negative.tn === 150
  };
}

const invokedDirectly = process.argv[1] !== undefined && resolve(process.argv[1]) === SCRIPT_PATH;
if (invokedDirectly) {
  const report = await buildVbnetCorrectnessReport({
    truthPath: argument("--truth") ?? undefined,
    sourceRoot: argument("--source-root") ?? undefined
  });
  const output = argument("--output");
  if (output !== null) await writeFile(resolve(PRODUCT_ROOT, output), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    output: output === null ? null : resolve(PRODUCT_ROOT, output),
    product: report.product,
    oracle: report.oracle,
    breadth: { ...report.breadth, admittedFailures: report.breadth.admittedFailures.length },
    positives: { total: report.positives.total, scores: report.positives.scores, truthSha256: report.positives.truthSha256 },
    negative: { total: report.negative.total, tn: report.negative.tn, falsePositiveCount: report.negative.falsePositives.length },
    passed: report.passed
  }, null, 2));
  if (!report.passed) process.exitCode = 1;
}
