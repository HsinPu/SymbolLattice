import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { extname, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "espree";

import { SqliteGraphStore } from "../../dist/infrastructure/sqlite/index.js";
import { resolveProjectFacts } from "../../dist/application/resolution.js";
import { extractFileFacts } from "../../dist/extraction/index.js";
import {
  ARTIFACT_FACTS_EXTRACTOR_VERSION,
  PROJECT_RESOLVER_VERSION
} from "../../dist/domain/index.js";
import { SYMBOL_LATTICE_VERSION } from "../../dist/version.js";

export const JAVASCRIPT_POSITIVE_QUOTAS = Object.freeze({
  identity: 40,
  containment: 40,
  call: 60,
  instantiation: 24,
  heritage: 5,
  esmImport: 65,
  commonJsImport: 66
});

const JAVASCRIPT_EXTENSIONS = new Set([".js", ".mjs", ".jsx", ".cjs"]);
const IGNORED_DIRECTORIES = new Set([".git", ".SymbolLattice", "node_modules"]);

export function isJavaScriptOracleIgnoredDirectory(name) {
  return name.startsWith(".") || IGNORED_DIRECTORIES.has(name);
}

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

function resolveRelativeJavaScriptModule(filePath, specifier, knownFiles) {
  if (knownFiles === undefined || (!specifier.startsWith("./") && !specifier.startsWith("../"))) {
    return null;
  }
  const base = posix.normalize(posix.join(posix.dirname(filePath), specifier));
  const candidates = extname(base).length > 0
    ? [base]
    : [
        base,
        ...[".js", ".mjs", ".cjs", ".jsx"].map((extension) => `${base}${extension}`),
        ...[".js", ".mjs", ".cjs", ".jsx"].map((extension) => `${base}/index${extension}`)
      ];
  const matches = [...new Set(candidates)].filter((candidate) => knownFiles.has(candidate));
  return matches.length === 1 ? matches[0] : null;
}

function topLevelBindings(program) {
  const bindings = new Set();
  for (const node of program.body) {
    if ((node.type === "FunctionDeclaration" || node.type === "ClassDeclaration") && node.id) {
      bindings.add(node.id.name);
    } else if (node.type === "VariableDeclaration") {
      node.declarations.forEach((declaration) => patternNames(declaration.id, bindings));
    } else if (node.type === "ImportDeclaration") {
      node.specifiers.forEach((specifier) => bindings.add(specifier.local.name));
    }
  }
  return bindings;
}

export function collectJavaScriptTruth(project, filePath, sourceText, context = {}) {
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
  for (const node of program.body) {
    if (node.type !== "ImportDeclaration" || typeof node.source?.value !== "string") continue;
    const targetPath = resolveRelativeJavaScriptModule(filePath, node.source.value, context.knownFiles);
    if (targetPath !== null) {
      facts.push({
        project,
        type: "positive",
        stratum: "esmImport",
        kind: "imports",
        source: file,
        target: { filePath: targetPath, name: targetPath, kind: "file", line: 1, column: 1 },
        occurrence: occurrence(filePath, node.source),
        moduleSyntax: "esm"
      });
    }
  }
  const strictCommonJs = filePath.toLowerCase().endsWith(".cjs") || program.body[0]?.directive === "use strict";
  if (strictCommonJs && !topLevelBindings(program).has("require")) {
    for (const node of program.body) {
      if (node.type !== "VariableDeclaration" || node.kind !== "const") continue;
      for (const declaration of node.declarations) {
        const call = declaration.init;
        if (
          call?.type !== "CallExpression" ||
          call.callee?.type !== "Identifier" ||
          call.callee.name !== "require" ||
          call.arguments?.length !== 1 ||
          call.arguments[0]?.type !== "Literal" ||
          typeof call.arguments[0].value !== "string"
        ) continue;
        const targetPath = resolveRelativeJavaScriptModule(
          filePath,
          call.arguments[0].value,
          context.knownFiles
        );
        if (targetPath !== null) {
          facts.push({
            project,
            type: "positive",
            stratum: "commonJsImport",
            kind: "imports",
            source: file,
            target: { filePath: targetPath, name: targetPath, kind: "file", line: 1, column: 1 },
            occurrence: occurrence(filePath, call.arguments[0]),
            moduleSyntax: "commonjs"
          });
        }
      }
    }
  }
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
        if (!isJavaScriptOracleIgnoredDirectory(entry.name)) await visit(resolve(directory, entry.name));
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
  const absolutePaths = await listJavaScriptFiles(sourcePath);
  const knownFiles = new Set(absolutePaths.map((absolutePath) => slash(relative(sourcePath, absolutePath))));
  for (const absolutePath of absolutePaths) {
    const filePath = slash(relative(sourcePath, absolutePath));
    try {
      const sourceText = await readFile(absolutePath, "utf8");
      for (const fact of collectJavaScriptTruth(project, filePath, sourceText, { knownFiles })) {
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

export function scoreJavaScriptNegativeMatrix() {
  const cases = [];
  const add = (category, entryPath, sourceText, extraFiles = {}) => {
    cases.push({ category, entryPath, sourceText, extraFiles });
  };
  for (let index = 0; index < 10; index += 1) {
    const marker = `// case:${index}`;
    add("external-esm", "entry.js", `import value from 'external-package';\n${marker}`);
    add("dynamic-import-template", "entry.js", `const name = 'target'; import(\`./${"${name}"}.js\`);\n${marker}`);
    add("dynamic-import-variable", "entry.js", `const path = './target.js'; import(path);\n${marker}`);
    add("dynamic-require", "entry.cjs", `const path = './target.js'; const value = require(path);\n${marker}`);
    add("shadowed-require", "entry.cjs", `function require(value) { return value }\nconst value = require('./target.js');\n${marker}`);
    add("hoisted-require", "entry.cjs", `if (false) { var require }\nconst value = require('./target.js');\n${marker}`);
    add("reassigned-require", "entry.cjs", `const value = require('./target.js');\nrequire = other;\n${marker}`);
    add("non-strict-js-require", "entry.js", `const value = require('./target.js');\n${marker}`);
    add("mixed-esm-commonjs", "entry.js", `import marker from 'external';\nconst value = require('./target.js');\n${marker}`);
    add("aliased-require", "entry.cjs", `const load = require; const value = load('./target.js');\n${marker}`);
    add("nested-only-require", "entry.cjs", `function load() { return require('./target.js') }\n${marker}`);
    add("require-two-arguments", "entry.cjs", `const value = require('./target.js', options);\n${marker}`);
    add("require-member-call", "entry.cjs", `const value = require.call(null, './target.js');\n${marker}`);
    add("ambiguous-relative", "entry.js", `import value from './target';\n${marker}`, {
      "target/index.js": "export default 2;\n"
    });
    add("unresolved-relative", "entry.js", `import value from './missing.js';\n${marker}`);
  }
  const falsePositives = [];
  cases.forEach((testCase, index) => {
    const files = {
      [testCase.entryPath]: testCase.sourceText,
      "target.js": "export default 1;\n",
      ...testCase.extraFiles
    };
    const sourceDocuments = Object.entries(files).map(([relativePath, sourceText]) => ({
      absolutePath: `C:/javascript-negative/${index}/${relativePath}`,
      relativePath,
      language: "javascript",
      sourceText,
      contentHash: stableHash(sourceText)
    }));
    const snapshot = resolveProjectFacts({
      sourceDocuments,
      extractedFiles: sourceDocuments.map((document) => extractFileFacts({
        filePath: document.relativePath,
        language: "javascript",
        sourceText: document.sourceText
      })),
      indexedAt: "2026-09-05T00:00:00.000Z"
    });
    const entry = snapshot.symbols.find((symbol) =>
      symbol.kind === "file" && symbol.filePath === testCase.entryPath
    );
    const localTargets = new Set(snapshot.symbols.filter((symbol) =>
      symbol.kind === "file" && symbol.filePath !== testCase.entryPath
    ).map((symbol) => symbol.id));
    const exact = snapshot.edges.filter((edge) =>
      edge.kind === "imports" &&
      edge.sourceId === entry?.id &&
      edge.targetId !== null &&
      localTargets.has(edge.targetId) &&
      exactSingleton(edge, edge.targetId)
    );
    if (exact.length > 0) falsePositives.push({ index, category: testCase.category, edges: exact.length });
  });
  return { total: cases.length, tn: cases.length - falsePositives.length, falsePositives };
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
  const positiveTruthSha256 = stableHash(positives.map(factKey).sort().join("\n"));
  const moduleSyntaxCounts = Object.fromEntries(
    ["esm", "commonjs"].map((syntax) => [
      syntax,
      positives.filter((fact) =>
        (fact.stratum === "esmImport" || fact.stratum === "commonJsImport") &&
        fact.moduleSyntax === syntax
      ).length
    ])
  );
  const missingStrata = Object.entries(JAVASCRIPT_POSITIVE_QUOTAS)
    .filter(([key, quota]) => positiveCounts[key] < quota)
    .map(([key, quota]) => ({ stratum: key, expected: quota, actual: positiveCounts[key] }));
  const store = new SqliteGraphStore();
  try {
    const snapshots = new Map(
      options.corpora.map((corpus) => [corpus.name, store.getSnapshot(corpus.indexedProjectPath)])
    );
    const scored = scoreJavaScriptSelection({ positives }, snapshots);
    const negative = scoreJavaScriptNegativeMatrix();
    const output = {
      schemaVersion: 1,
      benchmark: "symbollattice-javascript-large-project-correctness-v2",
      generatedAt: new Date().toISOString(),
      packageVersion: SYMBOL_LATTICE_VERSION,
      extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION,
      resolverVersion: PROJECT_RESOLVER_VERSION,
      oracle: { parser: "espree", version: "11.2.0", methodology: "deterministic-independent-estree-stratified-sample" },
      quotas: JAVASCRIPT_POSITIVE_QUOTAS,
      positiveCounts,
      positiveTruthSha256,
      moduleSyntaxCounts,
      missingStrata,
      corpusStats,
      status: missingStrata.length === 0 ? "complete" : "inconclusive",
      ...scored,
      negative,
      passed:
        missingStrata.length === 0 &&
        scored.scores.fp === 0 &&
        scored.scores.fn === 0 &&
        scored.scores.evidenceInvalid === 0 &&
        negative.tn === 150 &&
        negative.falsePositives.length === 0
    };
    await writeFile(options.output, `${JSON.stringify(output, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify({ output: options.output, status: output.status, scores: output.scores, positiveCounts, negative, passed: output.passed }, null, 2)}\n`);
    process.exitCode = output.passed ? 0 : output.status === "complete" ? 1 : 2;
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
