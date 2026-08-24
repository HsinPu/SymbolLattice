import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "espree";

import { SqliteGraphStore } from "../../dist/infrastructure/sqlite/index.js";
import {
  ARTIFACT_FACTS_EXTRACTOR_VERSION,
  PROJECT_RESOLVER_VERSION
} from "../../dist/domain/index.js";
import { SYMBOL_LATTICE_VERSION } from "../../dist/version.js";

export const JAVASCRIPT_POSITIVE_QUOTAS = Object.freeze({
  identity: 80,
  containment: 80,
  call: 60,
  instantiation: 20,
  heritage: 5
});

const JAVASCRIPT_EXTENSIONS = new Set([".js", ".mjs", ".jsx", ".cjs"]);
const IGNORED_DIRECTORIES = new Set([".git", ".SymbolLattice", "node_modules"]);

function slash(path) {
  return path.replaceAll("\\", "/");
}

function stableHash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function endpoint(filePath, name, kind, node) {
  return {
    filePath,
    name,
    kind,
    line: node.loc.start.line,
    column: node.loc.start.column + 1
  };
}

function occurrence(filePath, node) {
  return { filePath, line: node.loc.start.line, column: node.loc.start.column + 1 };
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

function parseJavaScript(sourceText, filePath) {
  const options = {
    ecmaVersion: "latest",
    loc: true,
    range: true,
    comment: false,
    tokens: false,
    ecmaFeatures: { jsx: filePath.toLowerCase().endsWith(".jsx") }
  };
  try {
    return parse(sourceText, { ...options, sourceType: "module" });
  } catch (moduleError) {
    try {
      return parse(sourceText, { ...options, sourceType: "script" });
    } catch {
      throw moduleError;
    }
  }
}

function patternNames(pattern, names = new Set()) {
  if (!pattern) return names;
  if (pattern.type === "Identifier") names.add(pattern.name);
  else if (pattern.type === "RestElement") patternNames(pattern.argument, names);
  else if (pattern.type === "AssignmentPattern") patternNames(pattern.left, names);
  else if (pattern.type === "ArrayPattern") pattern.elements.forEach((item) => patternNames(item, names));
  else if (pattern.type === "ObjectPattern") {
    pattern.properties.forEach((property) => patternNames(property.type === "Property" ? property.value : property.argument, names));
  }
  return names;
}

function directCallerBindings(caller) {
  const names = new Set(caller.params.flatMap((parameter) => [...patternNames(parameter)]));
  const visit = (node, root = false) => {
    if (!node || typeof node !== "object") return;
    if (!root && /Function(?:Declaration|Expression)$|ArrowFunctionExpression/.test(node.type)) return;
    if (node.type === "VariableDeclarator") patternNames(node.id, names);
    if (node.type === "ClassDeclaration" && node.id) names.add(node.id.name);
    if (node.type === "FunctionDeclaration" && node.id) names.add(node.id.name);
    for (const [key, value] of Object.entries(node)) {
      if (key === "loc" || key === "range" || key === "parent") continue;
      if (Array.isArray(value)) value.forEach((child) => visit(child));
      else visit(value);
    }
  };
  visit(caller.body, true);
  return names;
}

function callsInCaller(caller) {
  const calls = [];
  const news = [];
  const visit = (node, root = false) => {
    if (!node || typeof node !== "object") return;
    if (!root && /Function(?:Declaration|Expression)$|ArrowFunctionExpression/.test(node.type)) return;
    if (node.type === "CallExpression" && node.callee?.type === "Identifier") calls.push(node.callee);
    if (node.type === "NewExpression" && node.callee?.type === "Identifier") news.push(node.callee);
    for (const [key, value] of Object.entries(node)) {
      if (key === "loc" || key === "range" || key === "parent") continue;
      if (Array.isArray(value)) value.forEach((child) => visit(child));
      else visit(value);
    }
  };
  visit(caller.body, true);
  return { calls, news };
}

export function collectJavaScriptTruth(project, filePath, sourceText) {
  const program = parseJavaScript(sourceText, filePath);
  const declarations = program.body.filter(
    (node) =>
      (node.type === "FunctionDeclaration" || node.type === "ClassDeclaration") &&
      node.id?.type === "Identifier"
  );
  const byName = new Map();
  for (const declaration of declarations) {
    const list = byName.get(declaration.id.name) ?? [];
    list.push(declaration);
    byName.set(declaration.id.name, list);
  }
  const unique = new Map([...byName].filter(([, values]) => values.length === 1));
  const file = { filePath, name: filePath, kind: "file", line: 1, column: 1 };
  const facts = [];
  for (const declaration of declarations) {
    const kind = declaration.type === "ClassDeclaration" ? "class" : "function";
    const target = endpoint(filePath, declaration.id.name, kind, declaration.id);
    facts.push({ project, type: "positive", stratum: "identity", kind: "identity", source: null, target, occurrence: target });
    facts.push({ project, type: "positive", stratum: "containment", kind: "contains", source: file, target, occurrence: target });
    if (
      declaration.type === "ClassDeclaration" &&
      declaration.superClass?.type === "Identifier" &&
      unique.get(declaration.superClass.name)?.[0]?.type === "ClassDeclaration"
    ) {
      const parent = unique.get(declaration.superClass.name)[0];
      facts.push({
        project,
        type: "positive",
        stratum: "heritage",
        kind: "extends",
        source: target,
        target: endpoint(filePath, parent.id.name, "class", parent.id),
        occurrence: occurrence(filePath, declaration.superClass)
      });
    }
  }
  for (const caller of declarations.filter((node) => node.type === "FunctionDeclaration")) {
    const callerEndpoint = endpoint(filePath, caller.id.name, "function", caller.id);
    const bindings = directCallerBindings(caller);
    const { calls, news } = callsInCaller(caller);
    for (const callee of calls) {
      const target = unique.get(callee.name)?.[0];
      if (target?.type !== "FunctionDeclaration" || bindings.has(callee.name)) continue;
      facts.push({
        project,
        type: "positive",
        stratum: "call",
        kind: "calls",
        source: callerEndpoint,
        target: endpoint(filePath, target.id.name, "function", target.id),
        occurrence: occurrence(filePath, callee)
      });
    }
    for (const callee of news) {
      const target = unique.get(callee.name)?.[0];
      if (target?.type !== "ClassDeclaration" || bindings.has(callee.name)) continue;
      facts.push({
        project,
        type: "positive",
        stratum: "instantiation",
        kind: "instantiates",
        source: callerEndpoint,
        target: endpoint(filePath, target.id.name, "class", target.id),
        occurrence: occurrence(filePath, callee)
      });
    }
  }
  return facts;
}

async function listJavaScriptFiles(root) {
  const files = [];
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) await visit(resolve(directory, entry.name));
      } else if (entry.isFile() && JAVASCRIPT_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        files.push(resolve(directory, entry.name));
      }
    }
  };
  await visit(root);
  return files.sort();
}

async function collectCorpus(project, sourcePath) {
  const selections = new Map(Object.keys(JAVASCRIPT_POSITIVE_QUOTAS).map((key) => [key, []]));
  let parsedFiles = 0;
  let rejectedFiles = 0;
  for (const absolutePath of await listJavaScriptFiles(sourcePath)) {
    const filePath = slash(relative(sourcePath, absolutePath));
    try {
      const sourceText = await readFile(absolutePath, "utf8");
      for (const fact of collectJavaScriptTruth(project, filePath, sourceText)) {
        retainSmallest(selections.get(fact.stratum), fact, JAVASCRIPT_POSITIVE_QUOTAS[fact.stratum] * 10);
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
      (symbol.name === endpoint_.name ||
        (endpoint_.kind === "file" && symbol.qualifiedName === endpoint_.filePath))
  );
  const containing = candidates.filter(
    (symbol) => symbol.range.start.line <= endpoint_.line && endpoint_.line <= symbol.range.end.line
  );
  return containing.length > 0 ? containing : candidates.length === 1 ? candidates : [];
}

function exactSingleton(edge, targetId) {
  return edge.resolution === "exact" && edge.confidence === 1 && edge.targetId === targetId &&
    edge.evidence?.candidateSymbolIds?.length === 1 && edge.evidence.candidateSymbolIds[0] === targetId;
}

function scorePositive(snapshot, fact) {
  const targets = endpointCandidates(snapshot, fact.target);
  if (fact.kind === "identity") return targets.length === 1 ? { outcome: "tp" } : { outcome: "fn", reason: `target:${targets.length}` };
  const sources = endpointCandidates(snapshot, fact.source);
  if (sources.length !== 1 || targets.length !== 1) return { outcome: "fn", reason: `endpoints:${sources.length}/${targets.length}` };
  const edges = snapshot.edges.filter((edge) =>
    edge.kind === fact.kind && edge.sourceId === sources[0].id && edge.targetId === targets[0].id &&
    (fact.kind === "contains" || (edge.filePath === fact.occurrence.filePath && edge.range.start.line === fact.occurrence.line && edge.range.start.column === fact.occurrence.column))
  );
  const exact = edges.filter((edge) => exactSingleton(edge, targets[0].id));
  if (exact.length === 1) return { outcome: "tp", ruleId: exact[0].evidence.ruleId };
  if (edges.length > 0) return { outcome: "invalid", reason: `evidence:${edges.length}` };
  return { outcome: "fn", reason: "missing" };
}

export function scoreJavaScriptSelection(selection, snapshots) {
  const positives = selection.positives.map((fact) => ({ ...fact, score: scorePositive(snapshots.get(fact.project), fact) }));
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
      options.corpora.push({
        name,
        sourcePath: resolve(sourcePath),
        indexedProjectPath: resolve(indexedProjectPath)
      });
      index += 1;
    } else if (argument === "--output" && value) {
      options.output = resolve(value);
      index += 1;
    } else throw new Error(`Unknown or incomplete argument: ${argument}`);
  }
  if (!options.output || options.corpora.length === 0) throw new Error("Usage: --corpus name=source=index --output file");
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const pooled = new Map(Object.keys(JAVASCRIPT_POSITIVE_QUOTAS).map((key) => [key, []]));
  const corpusStats = {};
  for (const corpus of options.corpora) {
    const result = await collectCorpus(corpus.name, corpus.sourcePath);
    corpusStats[corpus.name] = { parsedFiles: result.parsedFiles, rejectedFiles: result.rejectedFiles };
    for (const [stratum, items] of result.selections) {
      for (const item of items) retainSmallest(pooled.get(stratum), item.fact, JAVASCRIPT_POSITIVE_QUOTAS[stratum]);
    }
  }
  const positives = [...pooled.values()].flatMap((items) => items.map((item) => item.fact));
  const positiveCounts = Object.fromEntries([...pooled].map(([key, items]) => [key, items.length]));
  const missingStrata = Object.entries(JAVASCRIPT_POSITIVE_QUOTAS)
    .filter(([key, quota]) => positiveCounts[key] < quota)
    .map(([key, quota]) => ({ stratum: key, expected: quota, actual: positiveCounts[key] }));
  const store = new SqliteGraphStore();
  try {
    const snapshots = new Map(
      options.corpora.map((corpus) => [corpus.name, store.getSnapshot(corpus.indexedProjectPath)])
    );
    const scored = scoreJavaScriptSelection({ positives }, snapshots);
    const output = {
      schemaVersion: 1,
      benchmark: "symbollattice-javascript-large-project-correctness-v1",
      generatedAt: new Date().toISOString(),
      packageVersion: SYMBOL_LATTICE_VERSION,
      extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION,
      resolverVersion: PROJECT_RESOLVER_VERSION,
      oracle: { parser: "espree", version: "11.2.0", methodology: "deterministic-independent-estree-stratified-sample" },
      quotas: JAVASCRIPT_POSITIVE_QUOTAS,
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
