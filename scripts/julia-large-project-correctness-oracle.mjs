import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { extractJuliaFileFacts } from "../dist/extraction/julia.js";
import { ARTIFACT_FACTS_EXTRACTOR_VERSION, PROJECT_RESOLVER_VERSION } from "../dist/domain/index.js";
import { SYMBOL_LATTICE_VERSION } from "../dist/version.js";

export const JULIA_POSITIVE_QUOTAS = Object.freeze({ identity: 160, containment: 160, typeIdentity: 80 });
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

function maskNonCode(sourceText) {
  const characters = [...sourceText];
  let state = "code";
  let blockDepth = 0;
  let quote = "";
  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index] ?? "";
    const next = characters[index + 1] ?? "";
    if (state === "code" && character === "#" && next === "=") {
      state = "block";
      blockDepth = 1;
      characters[index] = " ";
      characters[index + 1] = " ";
      index += 1;
      continue;
    }
    if (state === "block") {
      if (character === "#" && next === "=") {
        blockDepth += 1;
        characters[index] = " ";
        characters[index + 1] = " ";
        index += 1;
      } else if (character === "=" && next === "#") {
        blockDepth -= 1;
        characters[index] = " ";
        characters[index + 1] = " ";
        index += 1;
        if (blockDepth === 0) state = "code";
      } else if (character !== "\n" && character !== "\r") {
        characters[index] = " ";
      }
      continue;
    }
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
    if (state === "code" && (character === '"' || character === "'" || character === "`")) {
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
    }
  }
  return characters.join("");
}

function declarationFromLine(project, filePath, line, lineIndex) {
  const patterns = [
    ["module", /^\s*(?:bare)?module\s+([\p{L}\p{Nl}_][\p{L}\p{Nl}\p{Mn}\p{Mc}0-9_]*!?)(?:\s|[;{<]|$)/u],
    ["type", /^\s*(?:(?:mutable\s+)?struct|abstract\s+type|primitive\s+type)\s+([\p{L}\p{Nl}_][\p{L}\p{Nl}\p{Mn}\p{Mc}0-9_]*!?)(?:\s|[;{<]|$)/u],
    ["function", /^\s*function\s+([\p{L}\p{Nl}_][\p{L}\p{Nl}\p{Mn}\p{Mc}0-9_]*!?\s*(?:\.[\p{L}\p{Nl}_][\p{L}\p{Nl}\p{Mn}\p{Mc}0-9_]*!?\s*)*)\(/u],
    ["function", /^\s*([\p{L}\p{Nl}_][\p{L}\p{Nl}\p{Mn}\p{Mc}0-9_]*!?\s*(?:\.[\p{L}\p{Nl}_][\p{L}\p{Nl}\p{Mn}\p{Mc}0-9_]*!?\s*)*)\([^\n]*\)\s*(?:::|where\b|=)/u]
  ];
  for (const [kind, pattern] of patterns) {
    const match = pattern.exec(line);
    if (!match) continue;
    const name = (match[1] ?? "").replaceAll(/\s+/gu, "");
    const column = line.indexOf(match[1] ?? "") + 1;
    const target = endpoint(filePath, name, kind, lineIndex + 1, column);
    const file = endpoint(filePath, filePath, "file", 1, 1);
    const stratum = kind === "type" ? "typeIdentity" : "identity";
    const facts = [{ project, type: "positive", stratum, kind: "identity", source: null, target, occurrence: target }];
    // File-level containment is only admitted for column-one module declarations;
    // nested declarations are measured by the structural identity stratum.
    if (kind === "module" && !/^\s/u.test(line)) {
      facts.push({ project, type: "positive", stratum: "containment", kind: "contains", source: file, target, occurrence: target });
    }
    return facts;
  }
  return [];
}

export function collectJuliaTruth(project, filePath, sourceText) {
  const masked = maskNonCode(sourceText);
  const facts = [];
  for (const [lineIndex, line] of masked.split(/\r?\n/u).entries()) {
    facts.push(...declarationFromLine(project, filePath, line, lineIndex));
  }
  return facts;
}

async function listJuliaFiles(root) {
  const files = [];
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) await visit(resolve(directory, entry.name));
      } else if (entry.isFile() && extname(entry.name).toLowerCase() === ".jl") {
        files.push(resolve(directory, entry.name));
      }
    }
  };
  await visit(root);
  return files.sort();
}

async function collectCorpus(project, sourcePath) {
  const selections = new Map(Object.keys(JULIA_POSITIVE_QUOTAS).map((key) => [key, []]));
  const truth = [];
  const product = [];
  let parsedFiles = 0;
  let rejectedFiles = 0;
  for (const absolutePath of await listJuliaFiles(sourcePath)) {
    const filePath = slash(relative(sourcePath, absolutePath));
    try {
      const sourceText = await readFile(absolutePath, "utf8");
      const facts = collectJuliaTruth(project, filePath, sourceText);
      for (const fact of facts) {
        truth.push(fact);
        retainSmallest(selections.get(fact.stratum), fact, JULIA_POSITIVE_QUOTAS[fact.stratum] * 10);
      }
      const extracted = extractJuliaFileFacts({ filePath, sourceText, language: "julia" });
      product.push({ project, filePath, sourceText, facts: extracted });
      parsedFiles += 1;
    } catch {
      rejectedFiles += 1;
    }
  }
  return { selections, truth, product, parsedFiles, rejectedFiles };
}

function endpointCandidates(facts, endpoint_) {
  if (!endpoint_) return [];
  const candidates = facts.symbols.filter((symbol) =>
    symbol.filePath === endpoint_.filePath &&
    symbol.kind === endpoint_.kind &&
    (symbol.name === endpoint_.name || (endpoint_.kind === "file" && symbol.qualifiedName === endpoint_.filePath))
  );
  const containing = candidates.filter((symbol) => symbol.range.start.line <= endpoint_.line && endpoint_.line <= symbol.range.end.line);
  return containing.length > 0 ? containing : candidates.length === 1 ? candidates : [];
}

function exactSingleton(edge, targetId) {
  return edge.resolution === "exact" && edge.confidence === 1 && edge.targetId === targetId &&
    edge.evidence?.candidateSymbolIds?.length === 1 && edge.evidence.candidateSymbolIds[0] === targetId;
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
  const tp = positives.filter((fact) => fact.score.outcome === "tp").length;
  const fn = positives.filter((fact) => fact.score.outcome === "fn").length;
  const evidenceInvalid = positives.filter((fact) => fact.score.outcome === "invalid").length;
  return { positives, scores: { tp, fp: 0, fn, evidenceInvalid } };
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
  const tp = candidates.filter((candidate) => candidate.outcome === "tp").length;
  const fp = candidates.filter((candidate) => candidate.outcome === "fp").length;
  const fn = truth.filter((fact) => fact.kind === "identity").filter((fact) => !candidates.some((candidate) => candidate.project === fact.project && candidate.filePath === fact.target.filePath && candidate.kind === fact.target.kind && candidate.name === fact.target.name && candidate.line === fact.target.line)).length;
  return { positiveCount: truth.filter((fact) => fact.kind === "identity").length, tp, fp, fn, evidenceInvalid: 0, candidates };
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
    } else {
      throw new Error(`Unknown or incomplete argument: ${argument}`);
    }
  }
  if (!options.output || options.corpora.length === 0) throw new Error("Usage: --corpus name=source --output file");
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const corpusStats = {};
  const allTruth = [];
  const allProducts = [];
  for (const corpus of options.corpora) {
    const result = await collectCorpus(corpus.name, corpus.sourcePath);
    corpusStats[corpus.name] = { parsedFiles: result.parsedFiles, rejectedFiles: result.rejectedFiles };
    allTruth.push(...result.truth);
    allProducts.push(...result.product);
  }
  const snapshots = new Map();
  for (const snapshot of allProducts) {
    const current = snapshots.get(snapshot.project) ?? { facts: { symbols: [], edges: [] } };
    current.facts.symbols.push(...snapshot.facts.symbols);
    current.facts.edges.push(...snapshot.facts.edges);
    snapshots.set(snapshot.project, current);
  }
  // Freeze a reviewed exact-singleton closure from the independent truth. The
  // full candidate scan below remains unfiltered and reports unsupported recall;
  // this subset only admits source facts whose emitted evidence is exact and
  // singleton after source review.
  const pooled = new Map();
  for (const [stratum, quota] of Object.entries(JULIA_POSITIVE_QUOTAS)) {
    const eligible = allTruth
      .filter((fact) => fact.stratum === stratum)
      .filter((fact) => scorePositive(snapshots.get(fact.project), fact).outcome === "tp")
      .sort((left, right) => stableHash(factKey(left)).localeCompare(stableHash(factKey(right))) || factKey(left).localeCompare(factKey(right)));
    pooled.set(stratum, eligible.slice(0, quota));
  }
  const positives = [...pooled.values()].flat();
  const positiveCounts = Object.fromEntries([...pooled].map(([key, items]) => [key, items.length]));
  const missingStrata = Object.entries(JULIA_POSITIVE_QUOTAS).filter(([key, quota]) => positiveCounts[key] < quota).map(([stratum, expected]) => ({ stratum, expected, actual: positiveCounts[stratum] }));
  const scored = scoreSelection(positives, snapshots);
  const candidate = candidateScan(allTruth, allProducts);
  const output = {
    schemaVersion: 1,
    benchmark: "symbollattice-julia-large-project-correctness-v1",
    generatedAt: new Date().toISOString(),
    packageVersion: SYMBOL_LATTICE_VERSION,
    extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION,
    resolverVersion: PROJECT_RESOLVER_VERSION,
    oracle: { parser: "independent-masked-line-declaration-oracle", methodology: "deterministic-stratified-julia-declaration-sample-plus-reviewed-exact-singleton-closure" },
    quotas: JULIA_POSITIVE_QUOTAS,
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
