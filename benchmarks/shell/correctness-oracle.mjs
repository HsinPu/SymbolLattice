import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";

import { ARTIFACT_FACTS_EXTRACTOR_VERSION, PROJECT_RESOLVER_VERSION } from "../../dist/domain/facts.js";
import { extractShellFileFacts } from "../../dist/extraction/shell.js";
import { parseShellSource, SHELL_WASM_ABI_VERSION, SHELL_WASM_SHA256 } from "../../dist/extraction/shell-wasm-runtime.js";
import { SYMBOL_LATTICE_VERSION } from "../../dist/version.js";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const slash = (value) => value.replaceAll("\\", "/");

function filesBelow(root) {
  const result = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === ".git" || entry.name === ".SymbolLattice") continue;
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) {
        const metadata = statSync(path);
        if (metadata.size <= 65_536) result.push(path);
      }
    }
  };
  visit(root);
  return result.sort();
}

function dialect(filePath, sourceText) {
  const first = sourceText.split(/\r?\n/u, 1)[0] ?? "";
  const bashShebangs = new Set(["#!/bin/bash", "#!/usr/bin/bash", "#!/usr/bin/env bash"]);
  const posixShebangs = new Set(["#!/bin/sh", "#!/usr/bin/sh", "#!/bin/dash", "#!/usr/bin/dash", "#!/usr/bin/env sh", "#!/usr/bin/env dash"]);
  if (filePath.toLowerCase().endsWith(".bash")) return !first.startsWith("#!") || bashShebangs.has(first) ? "bash" : null;
  if (filePath.toLowerCase().endsWith(".sh")) {
    if (!first.startsWith("#!") && /^[ \t]*function[ \t]+[A-Za-z_][A-Za-z0-9_.:-]*(?:[ \t]*\(\))?[ \t]*(?:\r?\n[ \t]*)*(?:\{|\()/mu.test(sourceText)) return "bash";
    if (!first.startsWith("#!") || posixShebangs.has(first)) return "posix";
    return bashShebangs.has(first) ? "bash" : null;
  }
  if (posixShebangs.has(first)) return "posix";
  if (bashShebangs.has(first)) return "bash";
  return null;
}

function position(sourceText, byteOffset) {
  const prefix = new TextDecoder().decode(new TextEncoder().encode(sourceText).subarray(0, byteOffset));
  const lines = prefix.split("\n");
  return { line: lines.length, column: (lines.at(-1)?.replace(/\r$/u, "")?.length ?? 0) + 1 };
}

function collect(name, root, quota) {
  const candidates = [];
  let admittedFiles = 0;
  let rejectedFiles = 0;
  for (const absolutePath of filesBelow(root)) {
    const filePath = slash(relative(root, absolutePath));
    const bytes = readFileSync(absolutePath);
    let sourceText;
    try { sourceText = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { continue; }
    const variant = dialect(filePath, sourceText);
    if (variant === null) continue;
    const parsed = parseShellSource(bytes, variant);
    if (!parsed.ok) { rejectedFiles += 1; continue; }
    admittedFiles += 1;
    for (const call of parsed.calls) {
      const source = parsed.functions[call.sourceFunctionIndex];
      const target = parsed.functions[call.targetFunctionIndex];
      if (source === undefined || target === undefined) continue;
      const occurrence = position(sourceText, call.start);
      const fact = {
        project: name,
        filePath,
        sourceName: source.name,
        sourceOrdinal: parsed.functions.slice(0, call.sourceFunctionIndex).filter((item) => item.name === source.name).length,
        targetName: target.name,
        targetOrdinal: parsed.functions.slice(0, call.targetFunctionIndex).filter((item) => item.name === target.name).length,
        occurrence,
        referenceName: call.name,
        parserProvenance: call.parserProvenance
      };
      fact.hash = hash(JSON.stringify(fact));
      candidates.push({ fact, sourceText, bytes });
    }
  }
  candidates.sort((left, right) => left.fact.hash.localeCompare(right.fact.hash));
  const rows = candidates.slice(0, quota).map(({ fact, sourceText, bytes }) => {
    const facts = extractShellFileFacts({ filePath: fact.filePath, language: "shell", sourceText, sourceBytes: bytes });
    const source = facts.symbols.find((symbol) => symbol.kind === "function" && symbol.name === fact.sourceName && symbol.declarationOrdinal === fact.sourceOrdinal);
    const target = facts.symbols.find((symbol) => symbol.kind === "function" && symbol.name === fact.targetName && symbol.declarationOrdinal === fact.targetOrdinal);
    const edges = facts.edges.filter((edge) => edge.kind === "calls" && edge.sourceId === source?.id && edge.targetId === target?.id && edge.referenceName === fact.referenceName && edge.range.start.line === fact.occurrence.line && edge.range.start.column === fact.occurrence.column);
    const exact = edges.filter((edge) => edge.resolution === "exact" && edge.confidence === 1 && edge.evidence?.candidateSymbolIds?.length === 1 && edge.evidence.candidateSymbolIds[0] === target?.id);
    return { fact, outcome: exact.length === 1 ? "tp" : edges.length > 0 ? "invalid" : "fn" };
  });
  return { files: admittedFiles, rejectedFiles, candidates: candidates.length, quota, rows };
}

function negativeMatrix() {
  const renderers = [
    (i) => `f${i}(){ :; }\nf${i}(){ :; }\ncaller(){ f${i}; }\n`,
    (i) => `f${i}(){ :; }\ncaller(){ nested(){ :; }; f${i}; }\n`,
    (i) => `f${i}(){ :; }\ncaller(){ eval 'f${i}'; f${i}; }\n`,
    (i) => `f${i}(){ :; }\ncaller(){ source ./x.sh; f${i}; }\n`,
    (i) => `f${i}(){ :; }\ncaller(){ . ./x.sh; f${i}; }\n`,
    (i) => `f${i}(){ :; }\ncaller(){ alias f${i}=echo; f${i}; }\n`,
    (i) => `f${i}(){ :; }\ncaller(){ unalias f${i}; f${i}; }\n`,
    (i) => `f${i}(){ :; }\ncaller(){ unset -f f${i}; f${i}; }\n`,
    (i) => `f${i}(){ :; }\ncaller(){ echo $(f${i}); }\n`,
    (i) => `f${i}(){ :; }\ncaller(){ "$"{cmd}; }\n`,
    (i) => `f${i}(){ :; }\ncaller(){ 'f${i}'; }\n`,
    (i) => `f${i}(){ :; }\ncaller(){ external; }\n`,
    () => "broken(){\n",
    (i) => `f${i}(){ :; }\nf${i}\n`,
    (i) => `f${i}(){ :; }\ncaller(){ command f${i}; }\n`
  ];
  const failures = [];
  let total = 0;
  for (const [family, render] of renderers.entries()) {
    for (let index = 0; index < 10; index += 1) {
      total += 1;
      const sourceText = render(index);
      const facts = extractShellFileFacts({ filePath: family === 13 ? "negative.bash" : "negative.sh", language: "shell", sourceText });
      const exact = facts.edges.filter((edge) => edge.kind === "calls" && edge.resolution === "exact");
      if (exact.length > 0) failures.push({ family, index, edges: exact.length });
    }
  }
  return { total, tn: total - failures.length, falsePositives: failures };
}

const args = process.argv.slice(2);
const corpora = [];
let output;
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === "--corpus" && args[index + 1]) corpora.push(args[++index]);
  else if (args[index] === "--output" && args[index + 1]) output = resolve(args[++index]);
  else throw new Error(`Unknown argument ${args[index]}`);
}
if (corpora.length === 0 || output === undefined) throw new Error("Usage: one or more --corpus name=path=quota and --output file");
const results = corpora.map((value) => {
  const [name, root, quota] = value.split("=");
  return [name, collect(name, resolve(root), Number(quota))];
});
const rows = results.flatMap(([, result]) => result.rows);
const totals = { tp: rows.filter((row) => row.outcome === "tp").length, fp: 0, fn: rows.filter((row) => row.outcome === "fn").length, evidenceInvalid: rows.filter((row) => row.outcome === "invalid").length };
const negative = negativeMatrix();
const corpusStats = Object.fromEntries(results.map(([name, result]) => [name, { files: result.files, rejectedFiles: result.rejectedFiles, candidates: result.candidates, quota: result.quota, selected: result.rows.length }]));
const report = { schemaVersion: 1, benchmark: "symbollattice-shell-direct-call-v0.503", generatedAt: new Date().toISOString(), packageVersion: SYMBOL_LATTICE_VERSION, extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION, resolverVersion: PROJECT_RESOLVER_VERSION, parser: { engine: "mvdan.cc/sh/v3", version: "3.13.1", abiVersion: SHELL_WASM_ABI_VERSION, wasmSha256: SHELL_WASM_SHA256 }, corpusStats, positives: rows.length, positiveTruthSha256: hash(rows.map((row) => row.fact.hash).sort().join("\n")), totals, negative, rows, passed: rows.length === 300 && totals.fn === 0 && totals.evidenceInvalid === 0 && negative.tn === 150 };
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output, corpusStats, positives: rows.length, totals, negative, passed: report.passed }, null, 2));
process.exitCode = report.passed ? 0 : rows.length === 300 ? 1 : 2;
