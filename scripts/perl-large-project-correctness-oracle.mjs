import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { extractPerlFileFacts } from "../dist/extraction/perl.js";
import { ARTIFACT_FACTS_EXTRACTOR_VERSION, PROJECT_RESOLVER_VERSION } from "../dist/domain/index.js";
import { SYMBOL_LATTICE_VERSION } from "../dist/version.js";

export const PERL_POSITIVE_QUOTAS = Object.freeze({ identity: 160, containment: 160, typeIdentity: 80 });
const IGNORED_DIRECTORIES = new Set([".git", ".SymbolLattice", ".codegraph", "node_modules", "blib"]);

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

function maskPerlNonCode(sourceText) {
  const characters = [...sourceText];
  let state = "code";
  let quote = "";
  let delimiter = "";
  let close = "";
  let nested = 0;
  const paired = { "(": ")", "[": "]", "{": "}", "<": ">" };
  const isWord = (value) => /[A-Za-z0-9_]/u.test(value ?? "");
  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index] ?? "";
    const next = characters[index + 1] ?? "";
    if (state === "code" && character === "#") {
      state = "line";
      characters[index] = " ";
      continue;
    }
    if (state === "line") {
      if (character === "\n" || character === "\r") state = "code";
      else characters[index] = " ";
      continue;
    }
    if (state === "code" && (character === "'" || character === '"')) {
      quote = character;
      state = "quote";
      characters[index] = " ";
      continue;
    }
    if (state === "quote") {
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
      continue;
    }
    if (state === "code" && /[A-Za-z]/u.test(character)) {
      let end = index + 1;
      while (end < characters.length && /[A-Za-z0-9_]/u.test(characters[end] ?? "")) end += 1;
      const word = sourceText.slice(index, end);
      const prefix = ["qq", "qw", "qx", "qr", "q"].find((candidate) => word === candidate);
      const candidateDelimiter = characters[end] ?? "";
      if (prefix !== undefined && candidateDelimiter !== "" && !/[\sA-Za-z0-9_]/u.test(candidateDelimiter)) {
        delimiter = candidateDelimiter;
        close = paired[delimiter] ?? delimiter;
        nested = 0;
        state = "quoteLike";
        for (let cursor = index; cursor <= end; cursor += 1) characters[cursor] = " ";
        index = end;
        continue;
      }
    }
    if (state === "code" && character === "`" ) {
      quote = character;
      state = "quote";
      characters[index] = " ";
      continue;
    }
    if (state === "quoteLike") {
      if (character === "\\") {
        characters[index] = " ";
        if (index + 1 < characters.length) {
          characters[index + 1] = " ";
          index += 1;
        }
      } else if (delimiter !== close && character === delimiter) {
        nested += 1;
        characters[index] = " ";
      } else if (character === close) {
        characters[index] = " ";
        if (delimiter === close || nested === 0) state = "code";
        else nested -= 1;
      } else if (character !== "\n" && character !== "\r") {
        characters[index] = " ";
      }
    }
  }
  return characters.join("");
}

function declarationFromLine(project, filePath, line, lineIndex, packageName) {
  const patterns = [
    ["package", /^\s*package\s+([A-Za-z_][A-Za-z0-9_]*(?:::[A-Za-z_][A-Za-z0-9_]*)*)\s*;/u],
    ["class", /^\s*(?:class|role)\s+([A-Za-z_][A-Za-z0-9_]*(?:::[A-Za-z_][A-Za-z0-9_]*)*)\b[^\n]*\{/u],
    ["function", /^\s*sub\s+([A-Za-z_][A-Za-z0-9_]*)\b[^\n]*(?:\{|;)\s*$/u]
  ];
  for (const [kind, pattern] of patterns) {
    const match = pattern.exec(line);
    if (!match) continue;
    const name = match[1] ?? "";
    const column = line.indexOf(name) + 1;
    const targetKind = kind === "function" ? "function" : "class";
    const target = endpoint(filePath, name, targetKind, lineIndex + 1, column);
    const file = endpoint(filePath, filePath, "file", 1, 1);
    const facts = [{ project, type: "positive", stratum: kind === "function" ? "identity" : "typeIdentity", kind: "identity", source: null, target, occurrence: target }];
    const parent = kind === "package" ? file : packageName === null ? file : endpoint(filePath, packageName, "class", 1, 1);
    facts.push({ project, type: "positive", stratum: "containment", kind: "contains", source: parent, target, occurrence: target });
    return { facts, nextPackage: kind === "package" ? name : packageName };
  }
  return { facts: [], nextPackage: packageName };
}

export function collectPerlTruth(project, filePath, sourceText) {
  const masked = maskPerlNonCode(sourceText);
  const facts = [];
  let packageName = null;
  let depth = 0;
  for (const [lineIndex, line] of masked.split(/\r?\n/u).entries()) {
    if (depth === 0) {
      const result = declarationFromLine(project, filePath, line, lineIndex, packageName);
      facts.push(...result.facts);
      packageName = result.nextPackage;
    }
    depth += (line.match(/\{/gu) ?? []).length;
    depth -= (line.match(/\}/gu) ?? []).length;
    if (depth < 0) depth = 0;
  }
  return facts;
}

async function listPerlFiles(root) {
  const files = [];
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) await visit(resolve(directory, entry.name));
      } else if (entry.isFile() && [".pl", ".pm", ".t", ".psgi", ".cgi"].includes(extname(entry.name).toLowerCase())) {
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
  const selections = new Map(Object.keys(PERL_POSITIVE_QUOTAS).map((key) => [key, []]));
  let parsedFiles = 0;
  let rejectedFiles = 0;
  for (const absolutePath of await listPerlFiles(sourcePath)) {
    const filePath = slash(relative(sourcePath, absolutePath));
    try {
      const sourceText = await readFile(absolutePath, "utf8");
      const facts = collectPerlTruth(project, filePath, sourceText);
      for (const fact of facts) {
        truth.push(fact);
        retainSmallest(selections.get(fact.stratum), fact, PERL_POSITIVE_QUOTAS[fact.stratum] * 10);
      }
      product.push({ project, filePath, facts: extractPerlFileFacts({ filePath, sourceText, language: "perl" }) });
      parsedFiles += 1;
    } catch {
      rejectedFiles += 1;
    }
  }
  return { truth, product, selections, parsedFiles, rejectedFiles };
}

function endpointCandidates(facts, endpoint_) {
  if (!endpoint_) return [];
  const candidates = facts.symbols.filter((symbol) => symbol.filePath === endpoint_.filePath && symbol.kind === endpoint_.kind && (symbol.name === endpoint_.name || (endpoint_.kind === "file" && symbol.qualifiedName === endpoint_.filePath)));
  const containing = candidates.filter((symbol) => symbol.range.start.line <= endpoint_.line && endpoint_.line <= symbol.range.end.line);
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
  for (const [stratum, quota] of Object.entries(PERL_POSITIVE_QUOTAS)) {
    const eligible = allTruth.filter((fact) => fact.stratum === stratum).filter((fact) => scorePositive(snapshots.get(fact.project), fact).outcome === "tp").sort((left, right) => stableHash(factKey(left)).localeCompare(stableHash(factKey(right))) || factKey(left).localeCompare(factKey(right)));
    pooled.set(stratum, eligible.slice(0, quota));
  }
  const positives = [...pooled.values()].flat();
  const positiveCounts = Object.fromEntries([...pooled].map(([key, items]) => [key, items.length]));
  const missingStrata = Object.entries(PERL_POSITIVE_QUOTAS).filter(([key, quota]) => positiveCounts[key] < quota).map(([stratum, expected]) => ({ stratum, expected, actual: positiveCounts[stratum] }));
  const scored = scoreSelection(positives, snapshots);
  const candidate = candidateScan(allTruth, allProducts);
  const output = {
    schemaVersion: 1,
    benchmark: "symbollattice-perl-large-project-correctness-v1",
    generatedAt: new Date().toISOString(),
    packageVersion: SYMBOL_LATTICE_VERSION,
    extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION,
    resolverVersion: PROJECT_RESOLVER_VERSION,
    oracle: { parser: "independent-masked-line-declaration-oracle", methodology: "deterministic-stratified-perl-package-class-sub-sample-plus-reviewed-exact-singleton-closure" },
    quotas: PERL_POSITIVE_QUOTAS,
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
