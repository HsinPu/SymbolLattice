#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { extractFileFacts } from "../../dist/extraction/index.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const oraclePath = resolve(repositoryRoot, "benchmarks/groovy/GroovyOracle.groovy");
const options = parseArguments(process.argv.slice(2));

const corpora = options.corpora.map(({ name, path }) => scoreCorpus(name, path));
const negative = scoreNegatives(options.mode);
const totals = corpora.reduce((result, corpus) => ({
  positives: result.positives + corpus.score.positives,
  tp: result.tp + corpus.score.tp,
  fp: result.fp + corpus.score.fp,
  fn: result.fn + corpus.score.fn,
  evidenceInvalid: result.evidenceInvalid + corpus.score.evidenceInvalid
}), { positives: 0, tp: 0, fp: 0, fn: 0, evidenceInvalid: 0 });
const compilerCandidates = corpora.reduce((total, corpus) => total + corpus.compilerCandidates, 0);

const report = {
  schemaVersion: 1,
  benchmark: `symbollattice-groovy-compiler-approved-${options.mode}-calls-v1`,
  generatedAt: new Date().toISOString(),
  product: productEvidence(),
  oracle: {
    groovyVersion: options.groovyVersion,
    java: fileEvidence(options.java),
    classpath: options.classpath.split(process.platform === "win32" ? ";" : ":").map(fileEvidence),
    script: relative(repositoryRoot, oraclePath).replaceAll("\\", "/"),
    contract: [
      "compiler-parse-clean script class",
      "unique top-level def method name",
      `implicit-this ${options.mode === "self" ? "self" : "inter-function"} call outside closures`,
      "fixed arity match",
      "no nested brace, metaclass, shadow, assignment, or static import collision"
    ]
  },
  corpora,
  baseline: options.mode === "self"
    ? { version: "0.496.0", commit: "01b4c5fdcad423e889bab411f2c2b86c0795504f", tp: 0, fn: totals.positives }
    : { version: "0.497.0", commit: "de522fd0cb41892496ecf9625876959b1f92640d", tp: 0, fn: totals.positives },
  score: {
    ...totals,
    compilerCandidates,
    unsupportedCompilerCandidates: compilerCandidates - totals.positives,
    tn: negative.tn,
    negatives: negative.total,
    negativeFalsePositives: negative.falsePositives
  },
  negative,
  passed:
    totals.positives > 0 &&
    totals.tp === totals.positives &&
    totals.fp === 0 &&
    totals.fn === 0 &&
    totals.evidenceInvalid === 0 &&
    negative.tn === 150 &&
    negative.falsePositives.length === 0
};

if (options.output !== null) writeFileSync(options.output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output: options.output, score: report.score, passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;

function parseArguments(args) {
  let java = null;
  let classpath = null;
  let output = null;
  let groovyVersion = "5.0.3";
  let mode = "self";
  const corpora = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const value = args[index + 1];
    if (argument === "--java") java = value, index += 1;
    else if (argument === "--classpath") classpath = value, index += 1;
    else if (argument === "--output") output = resolve(value), index += 1;
    else if (argument === "--groovy-version") groovyVersion = value, index += 1;
    else if (argument === "--mode" && (value === "self" || value === "inter")) mode = value, index += 1;
    else if (argument === "--corpus") {
      const separator = value?.indexOf("=") ?? -1;
      if (separator <= 0) throw new Error("--corpus must be name=absolute-path");
      corpora.push({ name: value.slice(0, separator), path: resolve(value.slice(separator + 1)) });
      index += 1;
    } else throw new Error(`Unknown or incomplete argument: ${argument}`);
  }
  if (java === null || classpath === null || corpora.length === 0) {
    throw new Error("--java, --classpath, and at least one --corpus are required");
  }
  return { java: resolve(java), classpath, output, groovyVersion, mode, corpora };
}

function scoreCorpus(name, root) {
  const truth = JSON.parse(execFileSync(options.java, [
    "-cp", options.classpath, "groovy.ui.GroovyMain", oraclePath, root, options.mode
  ], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
  const allTruthKeys = new Map(truth.candidates.map((candidate) => [candidateKey(candidate), candidate]));
  const productEdges = [];
  const factsByFile = new Map();
  for (const absolute of walkGroovyFiles(root)) {
    const filePath = relative(root, absolute).replaceAll("\\", "/");
    const facts = extractFileFacts({ filePath, language: "groovy", sourceText: readFileSync(absolute, "utf8") });
    factsByFile.set(filePath, facts);
    for (const edge of facts.edges.filter((candidate) =>
      candidate.kind === "calls" && candidate.evidence?.ruleId === ruleId(options.mode)
    )) {
      productEdges.push({ filePath, edge });
    }
  }
  const approvedCandidates = truth.candidates.filter((candidate) => {
    const facts = factsByFile.get(candidate.filePath);
    if (facts === undefined) return false;
    const sourceMatches = facts.symbols.filter((symbol) =>
      symbol.kind === "function" && symbol.name === candidate.source && symbol.range.start.line === candidate.callerLine
    );
    const targetMatches = facts.symbols.filter((symbol) =>
      symbol.kind === "function" && symbol.name === candidate.target && symbol.range.start.line === candidate.targetLine
    );
    return sourceMatches.length === 1 && targetMatches.length === 1;
  });
  const truthKeys = new Map(approvedCandidates.map((candidate) => [candidateKey(candidate), candidate]));
  const productByKey = new Map(productEdges.map(({ filePath, edge }) => [edgeKey(filePath, edge), edge]));
  let tp = 0;
  let evidenceInvalid = 0;
  const missing = [];
  for (const [key, candidate] of truthKeys) {
    const edge = productByKey.get(key);
    if (edge === undefined) missing.push(candidate);
    else if (validExactEdge(edge, options.mode)) tp += 1;
    else evidenceInvalid += 1;
  }
  const falsePositives = productEdges
    .filter(({ filePath, edge }) => !allTruthKeys.has(edgeKey(filePath, edge)))
    .map(({ filePath, edge }) => ({ filePath, line: edge.range.start.line, column: edge.range.start.column, name: edge.referenceName }));
  return {
    name,
    root,
    source: sourceEvidence(root),
    groovyFiles: walkGroovyFiles(root).length,
    compilerRejectedFiles: truth.rejected.length,
    candidateSha256: truth.candidateSha256,
    compilerCandidates: truth.candidates.length,
    approvedCandidates: approvedCandidates.length,
    unsupportedCompilerCandidates: truth.candidates.filter((candidate) => !truthKeys.has(candidateKey(candidate))),
    score: {
      positives: approvedCandidates.length,
      tp,
      fp: falsePositives.length,
      fn: missing.length,
      evidenceInvalid
    },
    missing,
    falsePositives
  };
}

function validExactEdge(edge, mode) {
  return (mode === "self" ? edge.sourceId === edge.targetId : edge.sourceId !== edge.targetId) &&
    edge.resolution === "exact" && edge.confidence === 1 &&
    edge.evidence?.ruleId === ruleId(mode) &&
    edge.evidence?.candidateSymbolIds?.length === 1 && edge.evidence.candidateSymbolIds[0] === edge.targetId;
}

function ruleId(mode) {
  return mode === "self"
    ? "syntax.groovy.same-file.unique-direct-self-call.arity"
    : "syntax.groovy.same-file.unique-direct-function-call.arity";
}

function candidateKey(candidate) {
  return `${candidate.filePath}\0${candidate.line}\0${candidate.column}\0${candidate.target}`;
}

function edgeKey(filePath, edge) {
  return `${filePath}\0${edge.range.start.line}\0${edge.range.start.column}\0${edge.referenceName}`;
}

function walkGroovyFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === ".git" || entry.name === ".SymbolLattice" || entry.name === "node_modules") continue;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && extname(entry.name).toLowerCase() === ".groovy") files.push(absolute);
    }
  };
  visit(root);
  return files.sort();
}

function sourceEvidence(root) {
  const commit = execFileSync("git", ["-c", `safe.directory=${root.replaceAll("\\", "/")}`, "-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const clean = execFileSync("git", ["-c", `safe.directory=${root.replaceAll("\\", "/")}`, "-C", root, "status", "--porcelain=v1"], { encoding: "utf8" }).trim().length === 0;
  const licenseName = readdirSync(root).find((entry) => /^licen[sc]e(?:\.|$)/iu.test(entry));
  return { commit, clean, license: licenseName === undefined ? null : fileEvidence(join(root, licenseName)) };
}

function productEvidence() {
  const packageJson = JSON.parse(readFileSync(resolve(repositoryRoot, "package.json"), "utf8"));
  const commit = execFileSync("git", ["-c", `safe.directory=${repositoryRoot.replaceAll("\\", "/")}`, "-C", repositoryRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  return { version: packageJson.version, commit, repositoryClean: execFileSync("git", ["-c", `safe.directory=${repositoryRoot.replaceAll("\\", "/")}`, "-C", repositoryRoot, "status", "--porcelain=v1"], { encoding: "utf8" }).trim().length === 0 };
}

function fileEvidence(path) {
  const bytes = readFileSync(path);
  return { path: resolve(path), bytes: bytes.byteLength, sha512: createHash("sha512").update(bytes).digest("hex") };
}

function scoreNegatives(mode) {
  const cases = [];
  const add = (category, sourceText) => cases.push({ category, sourceText });
  for (let index = 0; index < 10; index += 1) {
    if (mode === "inter") {
      const target = `helper${index}`;
      const caller = `entry${index}`;
      add("parameter-shadow", `def ${target}(value) { value }\ndef ${caller}(${target}) { ${target}(1) }`);
      add("local-assignment", `def ${target}(value) { value }\ndef ${caller}() { def ${target} = { it }; ${target}(1) }`);
      add("member-call", `def ${target}(value) { value }\ndef ${caller}() { this.${target}(1) }`);
      add("arity-mismatch", `def ${target}(value) { value }\ndef ${caller}() { ${target}() }`);
      add("duplicate-target", `def ${target}(value) { value }\ndef ${target}(other) { other }\ndef ${caller}() { ${target}(1) }`);
      add("closure-body", `def ${target}(value) { value }\ndef ${caller}() { [1].each { ${target}(it) } }`);
      add("metaclass-taint", `def ${target}(value) { value }\ndef ${caller}() { ${target}(1) }\nExternal.metaClass.${target} = { it }`);
      add("static-import", `import static vendor.Helpers.${target}\ndef ${target}(value) { value }\ndef ${caller}() { ${target}(1) }`);
      add("import-terminal-collision", `import vendor.${target}\ndef ${target}(value) { value }\ndef ${caller}() { ${target}(1) }`);
      add("nested-block", `def ${target}(value) { value }\ndef ${caller}() { if (true) { ${target}(1) } }`);
      add("method-missing", `def ${target}(value) { value }\ndef methodMissing(name, args) { null }\ndef ${caller}() { ${target}(1) }`);
      add("invoke-method", `def ${target}(value) { value }\ndef invokeMethod(name, args) { null }\ndef ${caller}() { ${target}(1) }`);
      add("binding-assignment", `def ${target}(value) { value }\ndef ${caller}() { ${target}(1) }\n${target} = { it }`);
      add("typed-target", `int ${target}(int value) { value }\ndef ${caller}() { ${target}(1) }`);
      add("malformed", `def ${target}(value) { value }\ndef ${caller}() { ${target}(1)`);
      continue;
    }
    const name = `recurse${index}`;
    add("parameter-shadow", `def ${name}(${name}) { ${name}() }`);
    add("local-assignment", `def ${name}() { def ${name} = { 1 }; ${name}() }`);
    add("member-call", `def ${name}(value) { this.${name}(value) }`);
    add("arity-mismatch", `def ${name}(value) { ${name}() }`);
    add("duplicate-target", `def ${name}(value) { ${name}(value) }\ndef ${name}(other) { ${name}(other) }`);
    add("closure-body", `def ${name}(value) { [value].each { ${name}(it) } }`);
    add("metaclass-taint", `def ${name}(value) { ${name}(value) }\nExternal.metaClass.${name} = { it }`);
    add("static-import", `import static vendor.Helpers.${name}\ndef ${name}(value) { ${name}(value) }`);
    add("import-terminal-collision", `import vendor.${name}\ndef ${name}(value) { ${name}(value) }`);
    add("nested-block", `def ${name}(value) { if (value) { ${name}(value) } }`);
    add("string", `def ${name}(value) { "${name}(value)" }`);
    add("comment", `def ${name}(value) { /* ${name}(value) */ value }`);
    add("non-self-call", `def ${name}(value) { helper(value) }`);
    add("typed-method", `int ${name}(int value) { ${name}(value) }`);
    add("malformed", `def ${name}(value) { ${name}(value)`);
  }
  const falsePositives = [];
  cases.forEach((testCase, index) => {
    const facts = extractFileFacts({ filePath: `negative/${testCase.category}-${index}.groovy`, language: "groovy", sourceText: testCase.sourceText });
    if (facts.edges.some((edge) => edge.kind === "calls" && edge.evidence?.ruleId === ruleId(mode))) {
      falsePositives.push({ index, category: testCase.category });
    }
  });
  return { total: cases.length, tn: cases.length - falsePositives.length, falsePositives };
}
