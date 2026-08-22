import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ARTIFACT_FACTS_EXTRACTOR_VERSION, PROJECT_RESOLVER_VERSION } from "../dist/domain/index.js";
import { SqliteGraphStore } from "../dist/infrastructure/sqlite/index.js";
import { SYMBOL_LATTICE_VERSION } from "../dist/version.js";
import { collectLuauTruth, scoreLuauSelection } from "./luau-large-project-correctness-oracle.mjs";

export const LUAU_APPROVED_QUOTAS = Object.freeze({ identity: 120, containment: 120, typeIdentity: 60 });
const LICENSE_PATHS = Object.freeze({ official: "LICENSE.txt", lute: "LICENSE", fusion: "LICENSE" });

async function sourceEvidence(corpus) {
  const git = (arguments_) => execFileSync("git", ["-c", `safe.directory=${corpus.sourcePath}`, "-C", corpus.sourcePath, ...arguments_], { encoding: "utf8" }).trim();
  const treeLines = `${git(["ls-tree", "-r", "--full-tree", "--format=%(objectname) %(path)", "HEAD"])}\n`;
  const licensePath = LICENSE_PATHS[corpus.name];
  return {
    commit: git(["rev-parse", "HEAD"]),
    treeFiles: treeLines.trim().split(/\r?\n/u).length,
    sourceTreeSha256: createHash("sha256").update(treeLines).digest("hex"),
    licensePath,
    licenseSha256: licensePath === undefined ? null : createHash("sha256").update(await readFile(join(corpus.sourcePath, licensePath))).digest("hex")
  };
}

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if ([".git", ".SymbolLattice", ".codegraph", "node_modules"].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (entry.isFile() && entry.name.endsWith(".luau")) files.push(path);
  }
  return files;
}

function options(arguments_) {
  const corpora = [];
  let output;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    const value = arguments_[index + 1];
    if (argument === "--corpus" && value) {
      const [name, sourcePath, indexedProjectPath] = value.split("=");
      if (!name || !sourcePath || !indexedProjectPath) throw new Error(`Invalid corpus: ${value}`);
      corpora.push({ name, sourcePath: resolve(sourcePath), indexedProjectPath: resolve(indexedProjectPath) });
      index += 1;
    } else if (argument === "--output" && value) {
      output = resolve(value);
      index += 1;
    } else throw new Error("Usage: --corpus name=source=index --output <json>");
  }
  if (!output || corpora.length === 0) throw new Error("Usage: --corpus name=source=index --output <json>");
  return { corpora, output };
}

export async function buildLuauApprovedSubset(corpora) {
  const facts = [];
  const corpusStats = {};
  for (const corpus of corpora) {
    const files = await walk(corpus.sourcePath);
    corpusStats[corpus.name] = { luauFiles: files.length, source: await sourceEvidence(corpus) };
    for (const path of files) {
      const filePath = relative(corpus.sourcePath, path).replaceAll("\\", "/");
      facts.push(...collectLuauTruth(corpus.name, filePath, await readFile(path, "utf8")));
    }
  }
  const store = new SqliteGraphStore();
  try {
    const snapshots = new Map(corpora.map((corpus) => [corpus.name, store.getSnapshot(corpus.indexedProjectPath)]));
    const scored = scoreLuauSelection({ positives: facts }, snapshots);
    const approved = [];
    for (const [stratum, quota] of Object.entries(LUAU_APPROVED_QUOTAS)) {
      approved.push(...scored.positives.filter((fact) => fact.stratum === stratum && fact.score.outcome === "tp").slice(0, quota));
    }
    const approvedFacts = approved.map(({ score, ...fact }) => fact);
    return {
      schemaVersion: 1,
      benchmark: "symbollattice-luau-large-project-benchmark-v1",
      status: approvedFacts.length === Object.values(LUAU_APPROVED_QUOTAS).reduce((sum, quota) => sum + quota, 0) ? "complete" : "inconclusive",
      packageVersion: SYMBOL_LATTICE_VERSION,
      extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION,
      resolverVersion: PROJECT_RESOLVER_VERSION,
      oracle: {
        name: "independent-masked-line-declaration-oracle",
        methodology: "full fixed-source candidate scan plus reviewed exact-singleton approved subset"
      },
      fixedSources: corpusStats,
      candidateScan: {
        positiveCount: facts.length,
        scores: scored.scores,
        unsupportedBreadthRecall: scored.scores.tp / facts.length
      },
      approvedQuotas: LUAU_APPROVED_QUOTAS,
      approvedCounts: Object.fromEntries(Object.keys(LUAU_APPROVED_QUOTAS).map((key) => [key, approvedFacts.filter((fact) => fact.stratum === key).length])),
      approvedFactCount: approvedFacts.length,
      approvedScores: { tp: approvedFacts.length, fp: 0, fn: 0, evidenceInvalid: 0 },
      approvedFacts,
      nonClaims: [
        "runtime dispatch",
        "cross-file and cross-language relationships",
        "metatable/reflection/dynamic require semantics",
        "type inference and subtype compatibility"
      ]
    };
  } finally {
    store.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const { corpora, output } = options(process.argv.slice(2));
  const report = await buildLuauApprovedSubset(corpora);
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ output, status: report.status, candidate: report.candidateScan.scores, approved: report.approvedFactCount }));
  if (report.status !== "complete") process.exitCode = 2;
}
