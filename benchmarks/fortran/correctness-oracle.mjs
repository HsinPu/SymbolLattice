import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveProjectFacts } from "../../dist/application/resolution.js";
import { extractFileFacts } from "../../dist/extraction/index.js";
import { ARTIFACT_FACTS_EXTRACTOR_VERSION, PROJECT_RESOLVER_VERSION } from "../../dist/domain/index.js";
import { SYMBOL_LATTICE_VERSION } from "../../dist/version.js";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PRODUCT_ROOT = resolve(dirname(SCRIPT_PATH), "..", "..");
const RESEARCH_ROOT = resolve(PRODUCT_ROOT, "..", "research", "fortran-relations-v0.507.0");
const stableHash = (value) => createHash("sha256").update(value).digest("hex");

export const FORTRAN_POSITIVE_QUOTAS = Object.freeze({ BLAS: 50, CBLAS: 20, SRC: 80, TESTING: 150 });

function argument(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1] ?? null;
}

function git(...args) {
  return execFileSync("git", ["-c", `safe.directory=${PRODUCT_ROOT.replaceAll("\\", "/")}`, ...args], { cwd: PRODUCT_ROOT, encoding: "utf8" }).trim();
}

export function parseFortranOracleLine(line) {
  const f = line.split("\t");
  if (f.length !== 13 || f[0] !== "CANDIDATE") throw new Error(`Invalid Fortran oracle line: ${line}`);
  return {
    key: line, sourceFile: f[1], targetFile: f[2], callerKind: f[3], caller: f[4], target: f[5], arity: Number(f[6]),
    callerPosition: { line: Number(f[7]), column: Number(f[8]) },
    targetPosition: { line: Number(f[9]), column: Number(f[10]) },
    occurrence: { line: Number(f[11]), column: Number(f[12]) },
    scope: f[1].split("/", 1)[0]
  };
}

function buildSnapshot(files) {
  const sourceDocuments = Object.entries(files).map(([relativePath, sourceText]) => ({
    absolutePath: `C:/fortran-oracle/${relativePath}`, relativePath, language: "fortran", sourceText, contentHash: stableHash(sourceText)
  }));
  return resolveProjectFacts({
    sourceDocuments,
    extractedFiles: sourceDocuments.map((document) => extractFileFacts({ filePath: document.relativePath, language: "fortran", sourceText: document.sourceText })),
    indexedAt: "2026-09-05T00:00:00.000Z"
  });
}

function classify(candidate, snapshot) {
  const sources = snapshot.symbols.filter((symbol) => symbol.filePath === candidate.sourceFile &&
    (symbol.kind === "function" || symbol.kind === "module") && symbol.name.toLowerCase() === candidate.caller.toLowerCase() &&
    symbol.range.start.line === candidate.callerPosition.line && symbol.range.start.column === candidate.callerPosition.column);
  const targets = snapshot.symbols.filter((symbol) => symbol.filePath === candidate.targetFile && symbol.kind === "function" &&
    symbol.name.toLowerCase() === candidate.target.toLowerCase() && symbol.range.start.line === candidate.targetPosition.line &&
    symbol.range.start.column === candidate.targetPosition.column);
  if (sources.length !== 1 || targets.length !== 1) return "endpointRejected";
  const edges = snapshot.edges.filter((edge) => edge.kind === "calls" && edge.sourceId === sources[0].id && edge.targetId === targets[0].id &&
    edge.range.start.line === candidate.occurrence.line && edge.range.start.column === candidate.occurrence.column);
  if (edges.length === 0) return "fn";
  const edge = edges[0];
  const ids = edge.evidence?.candidateSymbolIds ?? [];
  return edge.resolution === "exact" && edge.confidence === 1 && ids.length === 1 && ids[0] === targets[0].id ? "tp" : "evidenceInvalid";
}

function scores(classified) {
  return classified.reduce((result, { status }) => {
    if (status === "endpointRejected") result.fn += 1;
    else result[status] += 1;
    return result;
  }, { tp: 0, fp: 0, fn: 0, evidenceInvalid: 0 });
}

export function selectFortranTruth(admitted) {
  return Object.entries(FORTRAN_POSITIVE_QUOTAS).flatMap(([scope, quota]) => admitted
    .filter(({ candidate }) => candidate.scope === scope)
    .map((item) => ({ ...item, hash: stableHash(item.candidate.key) }))
    .sort((a, b) => a.hash.localeCompare(b.hash) || a.candidate.key.localeCompare(b.candidate.key))
    .slice(0, quota));
}

function negativeCases() {
  const cases = [];
  const add = (category, count, files) => { for (let i = 0; i < count; i += 1) cases.push({ id: `${category}-${i}`, category, files: files(i) }); };
  const caller = (name = "HELPER", args = "1") => `      SUBROUTINE ENTRY()\n      CALL ${name}(${args})\n      END`;
  const target = (name = "HELPER", params = "X") => `      SUBROUTINE ${name}(${params})\n      END`;
  add("duplicate", 25, (i) => ({ [`src/entry${i}.f`]: caller(), [`src/a${i}.f`]: target(), [`src/b${i}.f`]: target() }));
  add("external-shadow", 25, (i) => ({ [`src/entry${i}.f`]: `      SUBROUTINE ENTRY()\n      EXTERNAL HELPER\n      CALL HELPER(1)\n      END`, [`src/helper${i}.f`]: target() }));
  add("wildcard-use", 25, (i) => ({ [`src/entry${i}.f`]: `      SUBROUTINE ENTRY()\n      USE FOREIGN\n      CALL HELPER(1)\n      END`, [`src/helper${i}.f`]: target() }));
  add("preprocessed", 25, (i) => ({ [`src/entry${i}.F`]: caller(), [`src/helper${i}.f`]: target() }));
  add("arity", 25, (i) => ({ [`src/entry${i}.f`]: caller("HELPER", "1, 2"), [`src/helper${i}.f`]: target() }));
  add("optional-or-malformed", 25, (i) => i % 2 === 0
    ? { [`src/entry${i}.f`]: caller(), [`src/helper${i}.f`]: `      SUBROUTINE HELPER(X)\n      OPTIONAL X\n      END` }
    : { [`src/entry${i}.f`]: `     $ ORPHAN\n      END`, [`src/helper${i}.f`]: target() });
  return cases;
}

export function scoreFortranNegativeMatrix() {
  const falsePositives = [];
  for (const item of negativeCases()) {
    const snapshot = buildSnapshot(item.files);
    const exact = snapshot.edges.filter((edge) => edge.kind === "calls" && edge.resolution === "exact");
    if (exact.length > 0) falsePositives.push({ ...item, exact });
  }
  return { total: 150, tn: 150 - falsePositives.length, falsePositives };
}

export async function buildFortranCorrectnessReport(options = {}) {
  const truthPath = resolve(options.truthPath ?? resolve(RESEARCH_ROOT, "lapack-project-candidates.tsv"));
  const sourceRoot = resolve(options.sourceRoot ?? resolve(RESEARCH_ROOT, "lapack"));
  const rawTruth = await readFile(truthPath, "utf8");
  const candidates = rawTruth.split(/\r?\n/u).filter(Boolean).map(parseFortranOracleLine);
  const filePaths = [...new Set(candidates.flatMap(({ sourceFile, targetFile }) => [sourceFile, targetFile]))];
  const files = Object.fromEntries(await Promise.all(filePaths.map(async (filePath) => [filePath, await readFile(resolve(sourceRoot, filePath), "utf8")])));
  const snapshot = buildSnapshot(files);
  const classified = candidates.map((candidate) => ({ candidate, status: classify(candidate, snapshot) }));
  const admitted = classified.filter(({ status }) => status !== "endpointRejected");
  const selected = selectFortranTruth(classified);
  const negative = scoreFortranNegativeMatrix();
  const admittedScores = scores(admitted);
  const selectedScores = scores(selected);
  return {
    schemaVersion: 1,
    benchmark: "symbollattice-fortran-relation-v0.507",
    generatedAt: new Date().toISOString(),
    product: { version: SYMBOL_LATTICE_VERSION, commit: git("rev-parse", "HEAD"), repositoryClean: git("status", "--porcelain") === "", extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION, resolverVersion: PROJECT_RESOLVER_VERSION },
    oracle: {
      parser: "fparser", version: "0.2.4", corpus: "Reference-LAPACK v3.12.1 peeled commit 6ec7f2bc4ecf4c4a93496aa2fa519575bc0e39ca",
      truthTsvSha256: stableHash(rawTruth), positiveSelection: "smallest SHA-256 keys per BLAS/CBLAS/SRC/TESTING quota",
      admission: "parse-clean lowercase non-preprocessed source; bare CALL; unique project subroutine target; fixed arity; no dummy, EXTERNAL, PROCEDURE, USE, interface, Optional, or preprocessing ambiguity",
      exactEdgeContract: "resolution=exact, confidence=1, matching source/target occurrence, singleton target candidate"
    },
    breadth: {
      corpusFiles: 3582, parserRejected: 9, compilerCandidates: candidates.length, endpointAdmitted: admitted.length,
      endpointRejected: candidates.length - admitted.length, admittedScores,
      failures: admitted.filter(({ status }) => status !== "tp")
    },
    positives: { total: selected.length, quotas: FORTRAN_POSITIVE_QUOTAS, truthSha256: stableHash(selected.map(({ candidate }) => candidate.key).sort().join("\n")), scores: selectedScores, failures: selected.filter(({ status }) => status !== "tp") },
    negative,
    nonclaims: ["preprocessed uppercase sources and macro configurations", "duplicate targets, dummy/EXTERNAL/PROCEDURE/USE/interface shadows, Optional targets, and arity mismatch", "type-bound calls, function invocation, generic interfaces, runtime dispatch, and endpoint-rejected declarations"],
    passed: selected.length === 300 && selectedScores.tp === 300 && selectedScores.fp === 0 && selectedScores.fn === 0 && selectedScores.evidenceInvalid === 0 && admittedScores.tp === admitted.length && admittedScores.fn === 0 && admittedScores.evidenceInvalid === 0 && negative.tn === 150
  };
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === SCRIPT_PATH) {
  const report = await buildFortranCorrectnessReport({ truthPath: argument("--truth") ?? undefined, sourceRoot: argument("--source-root") ?? undefined });
  const output = argument("--output");
  if (output !== null) await writeFile(resolve(PRODUCT_ROOT, output), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ output: output === null ? null : resolve(PRODUCT_ROOT, output), product: report.product, oracle: report.oracle, breadth: { ...report.breadth, failures: report.breadth.failures.length }, positives: report.positives, negative: { total: report.negative.total, tn: report.negative.tn, falsePositiveCount: report.negative.falsePositives.length }, passed: report.passed }, null, 2));
  if (!report.passed) process.exitCode = 1;
}
