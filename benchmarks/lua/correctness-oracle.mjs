import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { Language, Parser } from "web-tree-sitter";

import { ARTIFACT_FACTS_EXTRACTOR_VERSION, PROJECT_RESOLVER_VERSION } from "../../dist/domain/facts.js";
import { projectLuaStructuralFacts } from "../../dist/extraction/lua-structural.js";
import { inspectLuaTree } from "../../dist/extraction/lua-worker-ast.js";
import { LUA_GRAMMAR_SHA256, LUA_WORKER_RESPONSE_SCHEMA } from "../../dist/extraction/lua-worker-protocol.js";
import { SYMBOL_LATTICE_VERSION } from "../../dist/version.js";

const digest = (value) => createHash("sha256").update(value).digest("hex");
const slash = (value) => value.replaceAll("\\", "/");

await Parser.init();
const grammarBytes = readFileSync(new URL("../../src/assets/lua/tree-sitter-lua-v0.5.0.wasm", import.meta.url));
const language = await Language.load(grammarBytes);
const parser = new Parser();
parser.setLanguage(language);

function filesBelow(root) {
  const result = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === ".git" || entry.name === ".SymbolLattice" || entry.name === "vendor" || entry.name === "generated") continue;
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && entry.name.endsWith(".lua")) result.push(path);
    }
  };
  visit(root);
  return result.sort();
}

function response(bytes, inspected) {
  return {
    schema: LUA_WORKER_RESPONSE_SCHEMA,
    requestId: "benchmark",
    fileSha256: digest(bytes),
    grammarSha256: LUA_GRAMMAR_SHA256,
    decision: { kind: "emit" },
    metrics: inspected.metrics,
    declarations: inspected.declarations,
    calls: inspected.calls
  };
}

function position(sourceText, bytes, byteOffset) {
  const prefix = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, byteOffset));
  const lines = prefix.split(/\r\n|\r|\n/u);
  return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
}

function collect(name, root, quota) {
  const candidates = [];
  let parsedFiles = 0;
  let rejectedFiles = 0;
  for (const absolutePath of filesBelow(root)) {
    const bytes = readFileSync(absolutePath);
    if (bytes.length > 1_048_576) continue;
    let sourceText;
    try { sourceText = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { rejectedFiles += 1; continue; }
    const parserText = sourceText.replaceAll("\r\n", "\n");
    const tree = parser.parse(parserText);
    if (tree === null) { rejectedFiles += 1; continue; }
    const inspected = inspectLuaTree(tree.rootNode, bytes, parserText);
    tree.delete();
    if (inspected.code !== null) { rejectedFiles += 1; continue; }
    parsedFiles += 1;
    const filePath = slash(relative(root, absolutePath));
    for (const call of inspected.calls) {
      const source = inspected.declarations[call.sourceDeclarationIndex];
      const target = inspected.declarations[call.targetDeclarationIndex];
      if (source === undefined || target === undefined) continue;
      const fact = { project: name, filePath, sourceName: source.name, sourceOrdinal: inspected.declarations.slice(0, call.sourceDeclarationIndex).filter((item) => item.name === source.name).length, targetName: target.name, targetOrdinal: inspected.declarations.slice(0, call.targetDeclarationIndex).filter((item) => item.name === target.name).length, startByte: call.startByte, endByte: call.endByte, occurrence: position(sourceText, bytes, call.startByte), referenceName: call.name };
      fact.hash = digest(JSON.stringify(fact));
      candidates.push({ fact, sourceText, bytes, inspected });
    }
  }
  candidates.sort((left, right) => left.fact.hash.localeCompare(right.fact.hash));
  const rows = candidates.slice(0, quota).map(({ fact, sourceText, bytes, inspected }) => {
    const facts = projectLuaStructuralFacts({ filePath: fact.filePath, sourceBytes: bytes, sourceText, response: response(bytes, inspected) });
    const source = facts.symbols.find((symbol) => symbol.qualifiedName === `${fact.filePath}#${fact.sourceName}` && symbol.declarationOrdinal === fact.sourceOrdinal);
    const target = facts.symbols.find((symbol) => symbol.qualifiedName === `${fact.filePath}#${fact.targetName}` && symbol.declarationOrdinal === fact.targetOrdinal);
    const edges = facts.edges.filter((edge) => edge.kind === "calls" && edge.sourceId === source?.id && edge.targetId === target?.id && edge.referenceName === fact.referenceName && edge.range.start.line === fact.occurrence.line && edge.range.start.column === fact.occurrence.column);
    const exact = edges.filter((edge) => edge.resolution === "exact" && edge.confidence === 1 && edge.evidence?.candidateSymbolIds?.length === 1 && edge.evidence.candidateSymbolIds[0] === target?.id);
    return { fact, outcome: exact.length === 1 ? "tp" : edges.length > 0 ? "invalid" : "fn" };
  });
  return { parsedFiles, rejectedFiles, candidates: candidates.length, quota, rows };
}

function negativeMatrix() {
  const renderers = [
    (i) => `local function f${i}() end\nlocal f${i} = other\nlocal function caller() f${i}() end`,
    (i) => `local function f${i}() end\nf${i} = other\nlocal function caller() f${i}() end`,
    (i) => `local function f${i}() end\nlocal function caller(f${i}) f${i}() end`,
    (i) => `local function f${i}() end\nlocal function caller() local f${i}=other; f${i}() end`,
    (i) => `local function f${i}() end\nlocal function caller() return function() f${i}() end end`,
    (i) => `local function f${i}() end\nlocal function caller() load('f${i}()')() end`,
    (i) => `local function f${i}() end\nlocal function caller() loadfile('x.lua')() end`,
    (i) => `local function f${i}() end\nlocal function caller() dofile('x.lua'); f${i}() end`,
    (i) => `local function f${i}() end\nlocal function caller() debug.setupvalue(caller,1,other); f${i}() end`,
    (i) => `function f${i}() end\nlocal function caller() f${i}() end`,
    (i) => `local function f${i}() end\nlocal function f${i}() end\nlocal function caller() f${i}() end`,
    (i) => `local function caller() f${i}() end\nlocal function f${i}() end`,
    (i) => `local function f${i}() end\nlocal function caller() owner.f${i}() end`,
    (i) => `local function f${i}() end\nlocal function caller() owner:f${i}() end`,
    () => "local function broken("
  ];
  const failures = [];
  let total = 0;
  for (const [family, render] of renderers.entries()) for (let index = 0; index < 10; index += 1) {
    total += 1;
    const sourceText = render(index);
    const bytes = new TextEncoder().encode(sourceText);
    const tree = parser.parse(sourceText);
    if (tree === null) continue;
    const inspected = inspectLuaTree(tree.rootNode, bytes);
    tree.delete();
    if (inspected.code !== null) continue;
    const facts = projectLuaStructuralFacts({ filePath: `negative-${family}-${index}.lua`, sourceBytes: bytes, sourceText, response: response(bytes, inspected) });
    const exact = facts.edges.filter((edge) => edge.kind === "calls" && edge.resolution === "exact");
    if (exact.length > 0) failures.push({ family, index, edges: exact.length });
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
if (corpora.length === 0 || output === undefined) throw new Error("Usage: --corpus name=path=quota --output file");
const results = corpora.map((value) => { const [name, root, quota] = value.split("="); return [name, collect(name, resolve(root), Number(quota))]; });
const rows = results.flatMap(([, result]) => result.rows);
const totals = { tp: rows.filter((row) => row.outcome === "tp").length, fp: 0, fn: rows.filter((row) => row.outcome === "fn").length, evidenceInvalid: rows.filter((row) => row.outcome === "invalid").length };
const negative = negativeMatrix();
const corpusStats = Object.fromEntries(results.map(([name, result]) => [name, { parsedFiles: result.parsedFiles, rejectedFiles: result.rejectedFiles, candidates: result.candidates, quota: result.quota, selected: result.rows.length }]));
const report = { schemaVersion: 1, benchmark: "symbollattice-lua-direct-call-v0.504", generatedAt: new Date().toISOString(), packageVersion: SYMBOL_LATTICE_VERSION, extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION, resolverVersion: PROJECT_RESOLVER_VERSION, parser: { engine: "tree-sitter-lua", version: "0.5.0", grammarSha256: LUA_GRAMMAR_SHA256, workerSchema: LUA_WORKER_RESPONSE_SCHEMA }, corpusStats, positives: rows.length, positiveTruthSha256: digest(rows.map((row) => row.fact.hash).sort().join("\n")), totals, negative, rows, passed: rows.length === 300 && totals.fn === 0 && totals.evidenceInvalid === 0 && negative.tn === 150 };
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output, corpusStats, positives: rows.length, totals, negative, passed: report.passed }, null, 2));
process.exitCode = report.passed ? 0 : rows.length === 300 ? 1 : 2;
