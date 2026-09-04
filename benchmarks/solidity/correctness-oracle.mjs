import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import solc from "solc";

import { extractFileFacts } from "../../dist/extraction/index.js";
import { ARTIFACT_FACTS_EXTRACTOR_VERSION, PROJECT_RESOLVER_VERSION } from "../../dist/domain/index.js";
import { SYMBOL_LATTICE_VERSION } from "../../dist/version.js";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PRODUCT_ROOT = resolve(dirname(SCRIPT_PATH), "..", "..");
const GRAPH_ROOT = resolve(PRODUCT_ROOT, "..");
const DEFAULT_RESEARCH_ROOT = resolve(GRAPH_ROOT, "research", "solidity-relations-v0.505.0");
const IGNORED_DIRECTORIES = new Set([".git", ".SymbolLattice", "node_modules", "lib", "out", "cache"]);

export const SOLIDITY_POSITIVE_QUOTAS = Object.freeze({
  "openzeppelin-contracts": 190,
  "forge-std": 110
});

const slash = (path) => path.replaceAll("\\", "/");
const stableHash = (value) => createHash("sha256").update(value).digest("hex");

function argument(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1] ?? null;
}

function git(root, ...args) {
  return execFileSync("git", ["-c", `safe.directory=${slash(root)}`, "-C", root, ...args], { encoding: "utf8" }).trim();
}

export function isSolidityOracleIgnoredDirectory(name) {
  return name.startsWith(".") || IGNORED_DIRECTORIES.has(name);
}

async function solidityFiles(root) {
  const files = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && isSolidityOracleIgnoredDirectory(entry.name)) continue;
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && entry.name.endsWith(".sol")) files.push(path);
    }
  }
  await visit(root);
  return files.sort();
}

function byteOffsetToPosition(sourceText, byteOffset) {
  const prefix = Buffer.from(sourceText, "utf8").subarray(0, byteOffset).toString("utf8");
  const lines = prefix.split(/\r?\n/u);
  return { line: lines.length, column: (lines.at(-1) ?? "").length };
}

function span(src) {
  const [start, length] = src.split(":", 2).map(Number);
  return { start, end: start + length };
}

function walk(node, visit) {
  if (node === null || typeof node !== "object") return;
  visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((item) => walk(item, visit));
    else if (value !== null && typeof value === "object") walk(value, visit);
  }
}

function callerHazards(caller) {
  let hazardous = false;
  for (const parameter of [...(caller.parameters?.parameters ?? []), ...(caller.returnParameters?.parameters ?? [])]) {
    walk(parameter.typeName, (node) => { if (node.nodeType === "FunctionTypeName") hazardous = true; });
  }
  walk(caller.body, (node) => { if (node.nodeType === "InlineAssembly") hazardous = true; });
  return hazardous;
}

function callerBindings(caller) {
  const names = new Set();
  for (const parameter of [...(caller.parameters?.parameters ?? []), ...(caller.returnParameters?.parameters ?? [])]) {
    if (parameter.name) names.add(parameter.name);
  }
  walk(caller.body, (node) => {
    if (node.nodeType === "VariableDeclaration" && node.name) names.add(node.name);
  });
  return names;
}

export function parseSolidityAst(sourceText, filePath = "fixture.sol") {
  const input = {
    language: "Solidity",
    sources: { [filePath]: { content: sourceText } },
    settings: { stopAfter: "parsing", outputSelection: { "*": { "": ["ast"] } } }
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors ?? []).filter((error) => error.severity === "error");
  const ast = output.sources?.[filePath]?.ast;
  return { ast: errors.length === 0 ? ast ?? null : null, errors };
}

export function collectSolidityCallTruth(project, filePath, sourceText) {
  const { ast, errors } = parseSolidityAst(sourceText, filePath);
  if (ast === null) return { facts: [], rejected: true, errors: errors.map(({ errorCode, message }) => ({ errorCode, message })) };
  const facts = [];
  for (const contract of ast.nodes ?? []) {
    if (contract.nodeType !== "ContractDefinition" || contract.contractKind !== "contract") continue;
    const functions = (contract.nodes ?? []).filter((node) => node.nodeType === "FunctionDefinition");
    const targets = functions.filter((fn) =>
      fn.kind === "function" && fn.visibility === "private" && fn.body !== undefined
    );
    for (const target of targets) {
      if (functions.filter((fn) => fn.name === target.name).length !== 1) continue;
      const arity = target.parameters?.parameters?.length ?? -1;
      if (arity < 0) continue;
      for (const caller of functions) {
        if (caller.kind !== "function" || caller.body === undefined || callerHazards(caller)) continue;
        if (callerBindings(caller).has(target.name)) continue;
        walk(caller.body, (node) => {
          if (
            node.nodeType !== "FunctionCall" || node.expression?.nodeType !== "Identifier" ||
            node.expression.name !== target.name || (node.arguments?.length ?? -1) !== arity
          ) return;
          const callerPosition = byteOffsetToPosition(sourceText, span(caller.src).start);
          const targetPosition = byteOffsetToPosition(sourceText, span(target.src).start);
          const occurrence = byteOffsetToPosition(sourceText, span(node.src).start);
          facts.push({
            project,
            type: "positive",
            stratum: "privateFixedArityCall",
            kind: "calls",
            source: { filePath, name: caller.name, kind: "method", ...callerPosition },
            target: { filePath, name: target.name, kind: "method", ...targetPosition },
            occurrence: { filePath, ...occurrence },
            contract: contract.name,
            arity
          });
        });
      }
    }
  }
  return { facts, rejected: false, errors: [] };
}

function factKey(fact) {
  return JSON.stringify([fact.project, fact.kind, fact.source, fact.target, fact.occurrence, fact.arity]);
}

function selectQuota(facts, quota) {
  return facts
    .map((fact) => ({ fact, key: factKey(fact), hash: stableHash(factKey(fact)) }))
    .sort((left, right) => left.hash.localeCompare(right.hash) || left.key.localeCompare(right.key))
    .slice(0, quota)
    .map(({ fact }) => fact);
}

function exactEdgeForFact(fact, facts) {
  const sources = facts.symbols.filter((symbol) =>
    symbol.filePath === fact.source.filePath && symbol.kind === "method" && symbol.name === fact.source.name &&
    symbol.range.start.line === fact.source.line && symbol.range.start.column === fact.source.column
  );
  const targets = facts.symbols.filter((symbol) =>
    symbol.filePath === fact.target.filePath && symbol.kind === "method" && symbol.name === fact.target.name &&
    symbol.range.start.line === fact.target.line && symbol.range.start.column === fact.target.column
  );
  if (sources.length !== 1 || targets.length !== 1) return { status: "evidenceInvalid", edge: null };
  const source = sources[0];
  const target = targets[0];
  const candidates = facts.edges.filter((edge) =>
    edge.kind === "calls" && edge.sourceId === source.id && edge.targetId === target.id &&
    edge.range.start.line === fact.occurrence.line && edge.range.start.column === fact.occurrence.column
  );
  if (candidates.length === 0) return { status: "fn", edge: null };
  const edge = candidates[0];
  const candidateIds = edge.evidence?.candidateSymbolIds ?? [];
  return edge.resolution === "exact" && edge.confidence === 1 && candidateIds.length === 1 && candidateIds[0] === target.id
    ? { status: "tp", edge }
    : { status: "evidenceInvalid", edge };
}

export function scoreSolidityFacts(positives, extractedByFile) {
  const scores = { tp: 0, fp: 0, fn: 0, evidenceInvalid: 0 };
  const failures = [];
  for (const fact of positives) {
    const extracted = extractedByFile.get(`${fact.project}\0${fact.source.filePath}`);
    if (extracted === undefined) {
      scores.fn += 1;
      failures.push({ status: "fn", fact });
      continue;
    }
    const result = exactEdgeForFact(fact, extracted);
    scores[result.status] += 1;
    if (result.status !== "tp") failures.push({ status: result.status, fact, edge: result.edge });
  }
  return { scores, failures };
}

function negativeCases() {
  const cases = [];
  const add = (category, count, source) => {
    for (let index = 0; index < count; index += 1) cases.push({ id: `${category}-${index}`, category, source: source(index) });
  };
  add("visibility", 25, (i) => `contract C${i} { function entry(uint x) external { helper(x); } function helper(uint x) internal {} }`);
  add("overload", 20, (i) => `contract C${i} { function entry(uint x) external { helper(x); } function helper(uint x) private {} function helper(address x) private {} }`);
  add("shadow", 20, (i) => i % 2 === 0
    ? `contract C${i} { function entry(uint helper) external { helper(1); } function helper(uint x) private {} }`
    : `contract C${i} { function entry() external { uint helper = 1; helper(1); } function helper(uint x) private {} }`);
  add("qualified", 20, (i) => `contract C${i} { function entry(C${i} other) external { other.helper(1); } function helper(uint x) private {} }`);
  add("arity", 15, (i) => `contract C${i} { function entry() external { helper(${i}, 2); } function helper(uint x) private {} }`);
  add("dynamic", 20, (i) => i % 2 === 0
    ? `contract C${i} { function entry() external { assembly { helper() } } function helper() private {} }`
    : `contract C${i} { function entry(function() internal helper) external { helper(); } function helper() private {} }`);
  add("library", 15, (i) => `library L${i} { function entry() internal { helper(); } function helper() private {} }`);
  add("malformed", 15, (i) => `contract C${i} { function entry() external { helper(); } function helper() private {`);
  return cases;
}

export function scoreSolidityNegativeMatrix() {
  const cases = negativeCases();
  const falsePositives = [];
  for (const item of cases) {
    const facts = extractFileFacts({ filePath: `negative/${item.id}.sol`, language: "solidity", sourceText: item.source });
    const exactCalls = facts.edges.filter((edge) => edge.kind === "calls" && edge.resolution === "exact");
    if (exactCalls.length > 0) falsePositives.push({ ...item, exactCalls });
  }
  return { total: cases.length, tn: cases.length - falsePositives.length, falsePositives };
}

export async function buildSolidityCorrectnessReport(options = {}) {
  const researchRoot = resolve(options.researchRoot ?? DEFAULT_RESEARCH_ROOT);
  const corpora = [
    { name: "openzeppelin-contracts", tag: "v5.7.0", license: "MIT", root: resolve(researchRoot, "openzeppelin-contracts") },
    { name: "prb-math", tag: "v4.2.0", license: "MIT", root: resolve(researchRoot, "prb-math") },
    { name: "forge-std", tag: "v1.16.2", license: "Apache-2.0 OR MIT", root: resolve(researchRoot, "forge-std") }
  ];
  const extractedByFile = new Map();
  const corpusRows = [];
  const selected = [];
  const breadth = [];
  for (const corpus of corpora) {
    const files = await solidityFiles(corpus.root);
    const candidates = [];
    const sourceManifest = [];
    let rejected = 0;
    for (const absolutePath of files) {
      const filePath = slash(relative(corpus.root, absolutePath));
      const sourceText = await readFile(absolutePath, "utf8");
      sourceManifest.push(`${filePath}\0${stableHash(sourceText)}`);
      const truth = collectSolidityCallTruth(corpus.name, filePath, sourceText);
      if (truth.rejected) rejected += 1;
      candidates.push(...truth.facts);
      if (truth.facts.length > 0) {
        extractedByFile.set(`${corpus.name}\0${filePath}`, extractFileFacts({ filePath, language: "solidity", sourceText }));
      }
    }
    breadth.push(...candidates);
    const quota = SOLIDITY_POSITIVE_QUOTAS[corpus.name] ?? 0;
    selected.push(...selectQuota(candidates, quota));
    corpusRows.push({
      name: corpus.name,
      tag: corpus.tag,
      commit: git(corpus.root, "rev-parse", "HEAD"),
      license: corpus.license,
      repositoryClean: git(corpus.root, "status", "--porcelain") === "",
      files: files.length,
      sourceManifestSha256: stableHash(sourceManifest.sort().join("\n")),
      parserRejected: rejected,
      compilerConfirmedCandidates: candidates.length,
      selected: Math.min(quota, candidates.length)
    });
  }
  const selectedScore = scoreSolidityFacts(selected, extractedByFile);
  const breadthScore = scoreSolidityFacts(breadth, extractedByFile);
  const negative = scoreSolidityNegativeMatrix();
  const report = {
    schemaVersion: 1,
    benchmark: "symbollattice-solidity-relation-v0.505",
    generatedAt: new Date().toISOString(),
    product: {
      version: SYMBOL_LATTICE_VERSION,
      commit: git(PRODUCT_ROOT, "rev-parse", "HEAD"),
      repositoryClean: git(PRODUCT_ROOT, "status", "--porcelain") === "",
      extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION,
      resolverVersion: PROJECT_RESOLVER_VERSION
    },
    oracle: {
      compiler: "solc-js",
      version: solc.version(),
      admission: "parse-clean direct contract functions; unique private target; fixed arity bare identifier call; no caller inline assembly, function-typed parameter, or lexical shadow",
      positiveSelection: "smallest SHA-256 fact keys per fixed corpus quota",
      exactEdgeContract: "resolution=exact, confidence=1, matching source/target occurrence, singleton target candidate"
    },
    corpora: corpusRows,
    positives: {
      total: selected.length,
      truthSha256: stableHash(selected.map(factKey).sort().join("\n")),
      quotas: SOLIDITY_POSITIVE_QUOTAS,
      scores: selectedScore.scores,
      failures: selectedScore.failures
    },
    breadth: {
      compilerConfirmedCandidates: breadth.length,
      scores: breadthScore.scores,
      failures: breadthScore.failures
    },
    negative,
    nonclaims: [
      "internal/public/external targets and inherited or runtime dispatch",
      "overloads, lexical shadowing, function-typed values, inline assembly, qualified/member calls, and arity mismatch",
      "library calls, malformed source, imports and package resolution as relations, low-level call/delegatecall/staticcall, and generated/runtime behavior"
    ],
    passed:
      selected.length === 300 && selectedScore.scores.tp === 300 && selectedScore.scores.fp === 0 &&
      selectedScore.scores.fn === 0 && selectedScore.scores.evidenceInvalid === 0 &&
      breadthScore.scores.tp === breadth.length && breadthScore.scores.fn === 0 &&
      breadthScore.scores.evidenceInvalid === 0 && negative.total === 150 && negative.tn === 150
  };
  return report;
}

const invokedDirectly = process.argv[1] !== undefined && resolve(process.argv[1]) === SCRIPT_PATH;
if (invokedDirectly) {
  const report = await buildSolidityCorrectnessReport({ researchRoot: argument("--research-root") ?? undefined });
  const output = argument("--output");
  if (output !== null) await writeFile(resolve(PRODUCT_ROOT, output), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    output: output === null ? null : resolve(PRODUCT_ROOT, output),
    product: report.product,
    oracle: report.oracle,
    corpora: report.corpora,
    positives: { total: report.positives.total, scores: report.positives.scores, truthSha256: report.positives.truthSha256 },
    breadth: report.breadth,
    negative: { total: report.negative.total, tn: report.negative.tn, falsePositiveCount: report.negative.falsePositives.length },
    passed: report.passed
  }, null, 2));
  if (!report.passed) process.exitCode = 1;
}
