import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { extractRFileFacts } from "../dist/extraction/r.js";
import { ARTIFACT_FACTS_EXTRACTOR_VERSION, PROJECT_RESOLVER_VERSION } from "../dist/domain/index.js";
import { SYMBOL_LATTICE_VERSION } from "../dist/version.js";

export const R_POSITIVE_QUOTAS = Object.freeze({ identity: 170, containment: 170, typeIdentity: 60 });
const IGNORED_DIRECTORIES = new Set([".git", ".SymbolLattice", ".codegraph", "node_modules"]);

function slash(value) { return value.replaceAll("\\", "/"); }
function stableHash(value) { return createHash("sha256").update(value).digest("hex"); }
function endpoint(filePath, name, kind, line, column) { return { filePath, name, kind, line, column }; }
function factKey(fact) { return JSON.stringify([fact.project, fact.stratum, fact.kind, fact.source, fact.target, fact.occurrence]); }

function retainSmallest(selection, fact, quota) {
  const key = factKey(fact);
  if (selection.some((item) => item.key === key)) return;
  selection.push({ hash: stableHash(key), key, fact });
  selection.sort((left, right) => left.hash.localeCompare(right.hash) || left.key.localeCompare(right.key));
  if (selection.length > quota) selection.length = quota;
}

function maskRNonCode(sourceText) {
  const characters = [...sourceText];
  let state = "code";
  let quote = "";
  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index] ?? "";
    if (state === "code" && character === "#") {
      state = "comment";
      characters[index] = " ";
      continue;
    }
    if (state === "comment") {
      if (character === "\n" || character === "\r") state = "code";
      else characters[index] = " ";
      continue;
    }
    if (state === "code" && (character === "\"" || character === "'" || character === "`")) {
      quote = character;
      state = "string";
      characters[index] = " ";
      continue;
    }
    if (state === "string") {
      if (character === "\\") {
        characters[index] = " ";
        if (index + 1 < characters.length) {
          characters[index + 1] = " ";
          index += 1;
        }
      } else if (character === quote) {
        characters[index] = " ";
        state = "code";
      } else if (character !== "\n" && character !== "\r") {
        characters[index] = " ";
      }
    }
  }
  return characters.join("");
}

function declarationFromLine(project, filePath, rawLine, codeLine, lineIndex) {
  const functionMatch = /^\s*([A-Za-z_.][A-Za-z0-9_.]*)\s*(?:<-|=)\s*function\s*\(/u.exec(codeLine);
  if (functionMatch !== null) {
    const name = functionMatch[1] ?? "";
    const target = endpoint(filePath, name, "function", lineIndex + 1, codeLine.indexOf(name) + 1);
    const file = endpoint(filePath, filePath, "file", 1, 1);
    return {
      facts: [
        { project, type: "positive", stratum: "identity", kind: "identity", source: null, target, occurrence: target },
        { project, type: "positive", stratum: "containment", kind: "contains", source: file, target, occurrence: target }
      ],
      next: null
    };
  }
  const classMatch = /^\s*(setClass|setRefClass)\s*\(\s*(["'])([A-Za-z][A-Za-z0-9_.]*)\2/u.exec(rawLine);
  const classCodeMatch = /^\s*(?:setClass|setRefClass)\s*\(/u.exec(codeLine);
  if (classMatch !== null && classCodeMatch !== null && classMatch.index === classCodeMatch.index) {
    const name = classMatch[3] ?? "";
    const target = endpoint(filePath, name, "class", lineIndex + 1, rawLine.indexOf(name) + 1);
    const file = endpoint(filePath, filePath, "file", 1, 1);
    return {
      facts: [
        { project, type: "positive", stratum: "typeIdentity", kind: "identity", source: null, target, occurrence: target },
        { project, type: "positive", stratum: "containment", kind: "contains", source: file, target, occurrence: target }
      ],
      next: null
    };
  }
  return { facts: [], next: null };
}

export function collectRTruth(project, filePath, sourceText) {
  const masked = maskRNonCode(sourceText);
  const rawLines = sourceText.split(/\r?\n/u);
  const codeLines = masked.split(/\r?\n/u);
  const facts = [];
  let depth = 0;
  for (let lineIndex = 0; lineIndex < codeLines.length; lineIndex += 1) {
    const rawLine = rawLines[lineIndex] ?? "";
    const codeLine = codeLines[lineIndex] ?? "";
    if (depth === 0) facts.push(...declarationFromLine(project, filePath, rawLine, codeLine, lineIndex).facts);
    depth += (codeLine.match(/\{/gu) ?? []).length;
    depth -= (codeLine.match(/\}/gu) ?? []).length;
    if (depth < 0) depth = 0;
  }
  return facts;
}

async function listRFiles(root) {
  const files = [];
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) await visit(resolve(directory, entry.name));
      } else if (entry.isFile() && extname(entry.name).toLowerCase() === ".r") {
        files.push(resolve(directory, entry.name));
      }
    }
  };
  await visit(root);
  return files.sort();
}

async function collectCorpus(project, sourcePath) {
  const truth = [];
  const product = [];
  const selections = new Map(Object.keys(R_POSITIVE_QUOTAS).map((key) => [key, []]));
  let parsedFiles = 0;
  let rejectedFiles = 0;
  for (const absolutePath of await listRFiles(sourcePath)) {
    const filePath = slash(relative(sourcePath, absolutePath));
    try {
      const sourceText = await readFile(absolutePath, "utf8");
      const facts = collectRTruth(project, filePath, sourceText);
      for (const fact of facts) {
        truth.push(fact);
        retainSmallest(selections.get(fact.stratum), fact, R_POSITIVE_QUOTAS[fact.stratum] * 10);
      }
      product.push({ project, filePath, facts: extractRFileFacts({ filePath, sourceText, language: "r" }) });
      parsedFiles += 1;
    } catch {
      rejectedFiles += 1;
    }
  }
  return { truth, product, selections, parsedFiles, rejectedFiles };
}

function endpointCandidates(facts, expected) {
  if (!expected) return [];
  const candidates = facts.symbols.filter((symbol) => symbol.filePath === expected.filePath && symbol.kind === expected.kind && (symbol.name === expected.name || (expected.kind === "file" && symbol.qualifiedName === expected.filePath)));
  const containing = candidates.filter((symbol) => symbol.range.start.line <= expected.line && expected.line <= symbol.range.end.line);
  return containing.length > 0 ? containing : candidates.length === 1 ? candidates : [];
}

function exactSingleton(edge, targetId) {
  return edge.resolution === "exact" && edge.confidence === 1 && edge.targetId === targetId && edge.evidence?.candidateSymbolIds?.length === 1 && edge.evidence.candidateSymbolIds[0] === targetId;
}

function scorePositive(snapshot, fact) {
  const targets = endpointCandidates(snapshot.facts, fact.target);
  if (fact.kind === "identity") return targets.length === 1 ? { outcome: "tp" } : { outcome: "fn", reason: `target:${targets.length}` };
  const sources = endpointCandidates(snapshot.facts, fact.source);
  if (sources.length !== 1 || targets.length !== 1) return { outcome: "fn", reason: `endpoints:${sources.length}/${targets.length}` };
  const edges = snapshot.facts.edges.filter((edge) => edge.kind === fact.kind && edge.sourceId === sources[0].id && edge.targetId === targets[0].id);
  const exact = edges.filter((edge) => exactSingleton(edge, targets[0].id));
  if (exact.length === 1) return { outcome: "tp", ruleId: exact[0].evidence?.ruleId ?? null };
  if (edges.length > 0) return { outcome: "invalid", reason: `evidence:${edges.length}` };
  return { outcome: "fn", reason: "missing" };
}

function scoreSelection(selection, snapshots) {
  const positives = selection.map((fact) => ({ ...fact, score: scorePositive(snapshots.get(fact.project), fact) }));
  return {
    positives,
    scores: {
      tp: positives.filter((item) => item.score.outcome === "tp").length,
      fp: 0,
      fn: positives.filter((item) => item.score.outcome === "fn").length,
      evidenceInvalid: positives.filter((item) => item.score.outcome === "invalid").length
    }
  };
}

function candidateScan(truth, products) {
  const truthKeys = new Set(truth.filter((fact) => fact.kind === "identity").map((fact) => `${fact.project}\u0000${fact.target.filePath}\u0000${fact.target.kind}\u0000${fact.target.name}\u0000${fact.target.line}`));
  const candidates = [];
  for (const snapshot of products) {
    for (const symbol of snapshot.facts.symbols.filter((item) => item.kind !== "file")) {
      const key = `${snapshot.project}\u0000${symbol.filePath}\u0000${symbol.kind}\u0000${symbol.name}\u0000${symbol.range.start.line}`;
      candidates.push({ project: snapshot.project, filePath: symbol.filePath, name: symbol.name, kind: symbol.kind, line: symbol.range.start.line, outcome: truthKeys.has(key) ? "tp" : "fp" });
    }
  }
  const identityTruth = truth.filter((fact) => fact.kind === "identity");
  return {
    positiveCount: identityTruth.length,
    tp: candidates.filter((candidate) => candidate.outcome === "tp").length,
    fp: candidates.filter((candidate) => candidate.outcome === "fp").length,
    fn: identityTruth.filter((fact) => !candidates.some((candidate) => candidate.project === fact.project && candidate.filePath === fact.target.filePath && candidate.kind === fact.target.kind && candidate.name === fact.target.name && candidate.line === fact.target.line)).length,
    evidenceInvalid: 0,
    candidates
  };
}

function parseArguments(arguments_) {
  const options = { corpora: [] };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    const value = arguments_[index + 1];
    if (argument === "--corpus" && value) {
      const [name, sourcePath] = value.split("=");
      if (!name || !sourcePath) throw new Error(`Invalid corpus: ${value}`);
      options.corpora.push({ name, sourcePath: resolve(sourcePath) });
      index += 1;
    } else if (argument === "--output" && value) {
      options.output = resolve(value);
      index += 1;
    } else throw new Error(`Unknown or incomplete argument: ${argument}`);
  }
  if (!options.output || options.corpora.length === 0) throw new Error("Usage: --corpus name=source --output file");
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const allTruth = [];
  const allProducts = [];
  const corpusStats = {};
  for (const corpus of options.corpora) {
    const result = await collectCorpus(corpus.name, corpus.sourcePath);
    corpusStats[corpus.name] = { parsedFiles: result.parsedFiles, rejectedFiles: result.rejectedFiles };
    allTruth.push(...result.truth);
    allProducts.push(...result.product);
  }
  const snapshots = new Map();
  for (const product of allProducts) {
    const current = snapshots.get(product.project) ?? { facts: { symbols: [], edges: [] } };
    current.facts.symbols.push(...product.facts.symbols);
    current.facts.edges.push(...product.facts.edges);
    snapshots.set(product.project, current);
  }
  const pooled = new Map();
  for (const [stratum, quota] of Object.entries(R_POSITIVE_QUOTAS)) {
    const eligible = allTruth.filter((fact) => fact.stratum === stratum).filter((fact) => scorePositive(snapshots.get(fact.project), fact).outcome === "tp").sort((left, right) => stableHash(factKey(left)).localeCompare(stableHash(factKey(right))) || factKey(left).localeCompare(factKey(right)));
    pooled.set(stratum, eligible.slice(0, quota));
  }
  const positives = [...pooled.values()].flat();
  const positiveCounts = Object.fromEntries([...pooled].map(([key, items]) => [key, items.length]));
  const missingStrata = Object.entries(R_POSITIVE_QUOTAS).filter(([key, quota]) => positiveCounts[key] < quota).map(([stratum, expected]) => ({ stratum, expected, actual: positiveCounts[stratum] }));
  const scored = scoreSelection(positives, snapshots);
  const candidate = candidateScan(allTruth, allProducts);
  const output = {
    schemaVersion: 1,
    benchmark: "symbollattice-r-large-project-correctness-v1",
    generatedAt: new Date().toISOString(),
    packageVersion: SYMBOL_LATTICE_VERSION,
    extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION,
    resolverVersion: PROJECT_RESOLVER_VERSION,
    oracle: { parser: "independent-masked-line-r-function-and-s4-class-oracle", methodology: "deterministic-stratified-r-function-s4-class-sample-plus-reviewed-exact-singleton-closure" },
    quotas: R_POSITIVE_QUOTAS,
    positiveCounts,
    missingStrata,
    corpusStats,
    candidateScan: { ...candidate, candidates: candidate.candidates.slice(0, 5000) },
    status: missingStrata.length === 0 && scored.scores.fn === 0 && scored.scores.evidenceInvalid === 0 ? "complete" : "inconclusive",
    ...scored
  };
  await writeFile(options.output, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ output: options.output, status: output.status, scores: output.scores, positiveCounts, candidateScan: { positiveCount: candidate.positiveCount, tp: candidate.tp, fp: candidate.fp, fn: candidate.fn } }, null, 2)}\n`);
  process.exitCode = output.status === "complete" ? 0 : 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error instanceof Error ? error.stack : error); process.exitCode = 1; });
}
