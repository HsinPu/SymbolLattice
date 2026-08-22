import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { SqliteGraphStore } from "../dist/infrastructure/sqlite/index.js";
import {
  ARTIFACT_FACTS_EXTRACTOR_VERSION,
  PROJECT_RESOLVER_VERSION
} from "../dist/domain/index.js";
import { SYMBOL_LATTICE_VERSION } from "../dist/version.js";

export const LUAU_POSITIVE_QUOTAS = Object.freeze({
  identity: 160,
  containment: 160,
  typeIdentity: 80
});

const IGNORED_DIRECTORIES = new Set([".git", ".SymbolLattice", ".codegraph", "node_modules"]);

function slash(value) {
  return value.replaceAll("\\", "/");
}

function stableHash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function endpoint(filePath, name, kind, line, column) {
  return { filePath, name, kind, line, column };
}

function factKey(fact) {
  return JSON.stringify([fact.project, fact.stratum, fact.kind, fact.source, fact.target, fact.occurrence]);
}

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
  let longDelimiter = "";
  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index] ?? "";
    const next = characters[index + 1] ?? "";
    if (state === "code" && character === "-" && next === "-") {
      const opener = sourceText.slice(index + 2).match(/^\[(=*)\[/u);
      if (opener) {
        longDelimiter = opener[1] ?? "";
        state = "long-comment";
        characters[index] = " ";
        characters[index + 1] = " ";
        index += 1;
        continue;
      }
      state = "line-comment";
      characters[index] = " ";
      characters[index + 1] = " ";
      index += 1;
      continue;
    }
    if (state === "line-comment") {
      if (character === "\n" || character === "\r") state = "code";
      else characters[index] = " ";
      continue;
    }
    if (state === "long-comment") {
      const close = `]${longDelimiter}]`;
      if (sourceText.startsWith(close, index)) {
        for (let offset = 0; offset < close.length; offset += 1) characters[index + offset] = " ";
        index += close.length - 1;
        state = "code";
      } else if (character !== "\n" && character !== "\r") {
        characters[index] = " ";
      }
      continue;
    }
    if (state === "string") {
      if (character === "\\") {
        characters[index] = " ";
        if (index + 1 < characters.length && characters[index + 1] !== "\n" && characters[index + 1] !== "\r") {
          characters[index + 1] = " ";
          index += 1;
        }
      } else if (character === '"' || character === "'") {
        characters[index] = " ";
        state = "code";
      } else if (character !== "\n" && character !== "\r") {
        characters[index] = " ";
      }
      continue;
    }
    if (character === '"' || character === "'") {
      characters[index] = " ";
      state = "string";
    }
  }
  return characters.join("");
}

export function collectLuauTruth(project, filePath, sourceText) {
  const masked = maskNonCode(sourceText);
  const facts = [];
  const lines = masked.split(/\r?\n/u);
  for (let lineIndex = 0, offset = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? "";
    // The approved truth subset is column-one direct-root declarations. This
    // deliberately excludes nested closures and table-local methods without
    // attempting to duplicate the product's structural parser.
    const functionMatch = /^(?:(export)\s+)?(?:(local)\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*(?:[.:][A-Za-z_][A-Za-z0-9_]*)*)(?:\s*<[^>\r\n]*>)?\s*\(/u.exec(line);
    const typeMatch = /^(?:(export)\s+)?type\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s*<[^>\r\n]*>)?\s*=/u.exec(line);
    const file = endpoint(filePath, filePath, "file", 1, 1);
    if (functionMatch) {
      const fullName = functionMatch[3];
      const member = /[.:]/u.test(fullName);
      const name = fullName.split(/[.:]/u).at(-1) ?? fullName;
      const nameOffset = line.indexOf(fullName, functionMatch.index);
      const target = endpoint(filePath, name, member ? "method" : "function", lineIndex + 1, nameOffset + 1);
      facts.push({ project, type: "positive", stratum: "identity", kind: "identity", source: null, target, occurrence: target });
      facts.push({ project, type: "positive", stratum: "containment", kind: "contains", source: file, target, occurrence: target });
    }
    if (typeMatch) {
      const name = typeMatch[2];
      const nameOffset = line.indexOf(name, typeMatch.index);
      const target = endpoint(filePath, name, "type", lineIndex + 1, nameOffset + 1);
      facts.push({ project, type: "positive", stratum: "typeIdentity", kind: "identity", source: null, target, occurrence: target });
      facts.push({ project, type: "positive", stratum: "containment", kind: "contains", source: file, target, occurrence: target });
    }
    offset += line.length + 1;
  }
  return facts;
}

async function listLuauFiles(root) {
  const files = [];
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) await visit(resolve(directory, entry.name));
      } else if (entry.isFile() && extname(entry.name).toLowerCase() === ".luau") {
        files.push(resolve(directory, entry.name));
      }
    }
  };
  await visit(root);
  return files.sort();
}

async function collectCorpus(project, sourcePath) {
  const selections = new Map([
    ["identity", []],
    ["containment", []],
    ["typeIdentity", []]
  ]);
  let parsedFiles = 0;
  let rejectedFiles = 0;
  for (const absolutePath of await listLuauFiles(sourcePath)) {
    const filePath = slash(relative(sourcePath, absolutePath));
    try {
      const sourceText = await readFile(absolutePath, "utf8");
      for (const fact of collectLuauTruth(project, filePath, sourceText)) {
        retainSmallest(selections.get(fact.stratum), fact, LUAU_POSITIVE_QUOTAS[fact.stratum] * 10);
      }
      parsedFiles += 1;
    } catch {
      rejectedFiles += 1;
    }
  }
  return { selections, parsedFiles, rejectedFiles };
}

function endpointCandidates(snapshot, endpoint_) {
  if (!endpoint_) return [];
  const candidates = snapshot.symbols.filter(
    (symbol) =>
      symbol.filePath === endpoint_.filePath &&
      symbol.kind === endpoint_.kind &&
      (symbol.name === endpoint_.name || (endpoint_.kind === "file" && symbol.qualifiedName === endpoint_.filePath))
  );
  const containing = candidates.filter(
    (symbol) => symbol.range.start.line <= endpoint_.line && endpoint_.line <= symbol.range.end.line
  );
  return containing.length > 0 ? containing : candidates.length === 1 ? candidates : [];
}

function exactSingleton(edge, targetId) {
  return edge.resolution === "exact" &&
    edge.confidence === 1 &&
    edge.targetId === targetId &&
    edge.evidence?.candidateSymbolIds?.length === 1 &&
    edge.evidence.candidateSymbolIds[0] === targetId;
}

function scorePositive(snapshot, fact) {
  const targets = endpointCandidates(snapshot, fact.target);
  if (fact.kind === "identity") return targets.length === 1 ? { outcome: "tp" } : { outcome: "fn", reason: `target:${targets.length}` };
  const sources = endpointCandidates(snapshot, fact.source);
  if (sources.length !== 1 || targets.length !== 1) return { outcome: "fn", reason: `endpoints:${sources.length}/${targets.length}` };
  const edges = snapshot.edges.filter((edge) =>
    edge.kind === fact.kind && edge.sourceId === sources[0].id && edge.targetId === targets[0].id
  );
  const exact = edges.filter((edge) => exactSingleton(edge, targets[0].id));
  if (exact.length === 1) return { outcome: "tp", ruleId: exact[0].evidence?.ruleId ?? null };
  if (edges.length > 0) return { outcome: "invalid", reason: `evidence:${edges.length}` };
  return { outcome: "fn", reason: "missing" };
}

export function scoreLuauSelection(selection, snapshots) {
  const positives = selection.positives.map((fact) => ({
    ...fact,
    score: scorePositive(snapshots.get(fact.project), fact)
  }));
  const tp = positives.filter((fact) => fact.score.outcome === "tp").length;
  const fn = positives.filter((fact) => fact.score.outcome === "fn").length;
  const evidenceInvalid = positives.filter((fact) => fact.score.outcome === "invalid").length;
  return { positives, scores: { tp, fp: 0, fn, evidenceInvalid } };
}

function parseArguments(arguments_) {
  const options = { corpora: [] };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    const value = arguments_[index + 1];
    if (argument === "--corpus" && value) {
      const [name, sourcePath, indexedProjectPath] = value.split("=");
      if (!name || !sourcePath || !indexedProjectPath) throw new Error(`Invalid corpus: ${value}`);
      options.corpora.push({ name, sourcePath: resolve(sourcePath), indexedProjectPath: resolve(indexedProjectPath) });
      index += 1;
    } else if (argument === "--output" && value) {
      options.output = resolve(value);
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${argument}`);
    }
  }
  if (!options.output || options.corpora.length === 0) throw new Error("Usage: --corpus name=source=index --output file");
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const pooled = new Map(Object.keys(LUAU_POSITIVE_QUOTAS).map((key) => [key, []]));
  const corpusStats = {};
  for (const corpus of options.corpora) {
    const result = await collectCorpus(corpus.name, corpus.sourcePath);
    corpusStats[corpus.name] = { parsedFiles: result.parsedFiles, rejectedFiles: result.rejectedFiles };
    for (const [stratum, items] of result.selections) {
      for (const item of items) retainSmallest(pooled.get(stratum), item.fact, LUAU_POSITIVE_QUOTAS[stratum]);
    }
  }
  const positives = [...pooled.values()].flatMap((items) => items.map((item) => item.fact));
  const positiveCounts = Object.fromEntries([...pooled].map(([key, items]) => [key, items.length]));
  const missingStrata = Object.entries(LUAU_POSITIVE_QUOTAS)
    .filter(([key, quota]) => positiveCounts[key] < quota)
    .map(([stratum, expected]) => ({ stratum, expected, actual: positiveCounts[stratum] }));
  const store = new SqliteGraphStore();
  try {
    const snapshots = new Map(options.corpora.map((corpus) => [corpus.name, store.getSnapshot(corpus.indexedProjectPath)]));
    const scored = scoreLuauSelection({ positives }, snapshots);
    const output = {
      schemaVersion: 1,
      benchmark: "symbollattice-luau-large-project-correctness-v1",
      generatedAt: new Date().toISOString(),
      packageVersion: SYMBOL_LATTICE_VERSION,
      extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION,
      resolverVersion: PROJECT_RESOLVER_VERSION,
      oracle: { parser: "independent-masked-line-declaration-oracle", methodology: "deterministic-stratified-declaration-sample" },
      quotas: LUAU_POSITIVE_QUOTAS,
      positiveCounts,
      missingStrata,
      corpusStats,
      status: missingStrata.length === 0 ? "complete" : "inconclusive",
      ...scored
    };
    await writeFile(options.output, `${JSON.stringify(output, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify({ output: options.output, status: output.status, scores: output.scores, positiveCounts }, null, 2)}\n`);
    process.exitCode = output.status === "complete" ? 0 : 2;
  } finally {
    store.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
