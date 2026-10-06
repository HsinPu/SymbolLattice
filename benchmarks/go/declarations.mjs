import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { productFingerprint } from "../mcp/task-retrieval.mjs";

const [projectArg, goArg, outputArg, baselineArg, candidateArg] = process.argv.slice(2);
if ([projectArg, goArg, outputArg, baselineArg, candidateArg].some(value => !value)) {
  throw new Error("Usage: node benchmarks/go/declarations.mjs <pinned-project> <go.exe> <external-report.json> <built-baseline-root> <built-candidate-root>");
}
const project = resolve(projectArg), output = resolve(outputArg);
const git = (...args) => execFileSync("git", ["-c", `safe.directory=${project.replaceAll("\\", "/")}`, ...args],
  { cwd: project, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }).trim();
assert.equal(git("status", "--porcelain", "--untracked-files=no"), "", "Tracked corpus changed");
const files = git("ls-files", "*.go").split(/\r?\n/u).filter(Boolean).sort();
const sha256 = value => createHash("sha256").update(value).digest("hex");
const sourceIdentities = files.map(file => ({ file, sha256: sha256(readFileSync(resolve(project, file))) }));
mkdirSync(dirname(output), { recursive: true });
const executable = resolve(dirname(output), "declaration-oracle.exe");
const helper = fileURLToPath(new URL("./DeclarationOracle.go", import.meta.url));
const env = { ...process.env, GOTOOLCHAIN: "local", GOWORK: "off", GO111MODULE: "off", GOPROXY: "off" };
execFileSync(resolve(goArg), ["build", "-o", executable, helper], { env, timeout: 180_000, windowsHide: true });
const oracle = JSON.parse(execFileSync(executable, [], { input: JSON.stringify({ project, files }),
  encoding: "utf8", timeout: 90_000, maxBuffer: 64 * 1024 * 1024, windowsHide: true }));
const roots = { baseline: resolve(baselineArg), candidate: resolve(candidateArg) };
const builds = {};
for (const [name, root] of Object.entries(roots)) {
  builds[name] = { root, version: JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).version,
    fingerprint: productFingerprint(root) };
}
const products = await Promise.all(Object.values(roots).map(root =>
  import(pathToFileURL(resolve(root, "dist/extraction/go.js")).href)));
const parsers = await Promise.all(Object.values(roots).map(root =>
  import(pathToFileURL(resolve(root, "dist/extraction/go-parser/parser.js")).href)));
const coordinateOffset = (source, point) => {
  const lines = source.split("\n");
  return lines.slice(0, point.line - 1).reduce((sum, line) => sum + line.length + 1, 0) + point.column - 1;
};
const key = decl => JSON.stringify([decl.name, decl.kind, decl.receiver, decl.range]);
const rows = [];
for (const truth of oracle) {
  const sourceText = readFileSync(resolve(project, truth.file), "utf8");
  const excludedRanges = new Set(truth.declarations.filter(decl => !decl.receiverKnown)
    .map(decl => JSON.stringify(decl.range)));
  const observed = {};
  const raw = [];
  for (const [index, name] of ["baseline", "candidate"].entries()) {
    const facts = products[index].extractGoFileFacts({ filePath: truth.file, sourceText, language: "go" });
    raw.push(facts);
    const errors = [];
    parsers[index].parser.parse(sourceText).iterate({ enter(node) {
      if (node.type.isError) errors.push({ from: node.from, to: node.to });
    } });
    const declarations = facts.symbols.filter(symbol => ["function", "method"].includes(symbol.kind))
      .filter(symbol => /^func\b/u.test(sourceText.slice(coordinateOffset(sourceText, symbol.range.start))))
      .filter(symbol => !excludedRanges.has(JSON.stringify(symbol.range)))
      .map(symbol => ({ name: symbol.name, kind: symbol.kind,
        receiver: symbol.kind === "method" ? symbol.qualifiedName.split("#")[1].split(".")[0] : "",
        range: symbol.range }));
    const eligible = truth.declarations.filter(decl => decl.receiverKnown);
    const expected = new Set(eligible.map(key));
    const actual = new Set(declarations.map(key));
    observed[name] = { declarations, parserErrors: errors,
      truePositives: declarations.filter(decl => expected.has(key(decl))),
      falsePositives: declarations.filter(decl => !expected.has(key(decl))),
      falseNegatives: eligible.filter(decl => !actual.has(key(decl))) };
  }
  rows.push({ file: truth.file, oracleError: truth.error ?? null,
    oracleDeclarations: truth.declarations,
    excludedReceivers: truth.declarations.filter(decl => !decl.receiverKnown),
    baseline: observed.baseline, candidate: observed.candidate,
    completeRawFactsEqual: isDeepStrictEqual(raw[0], raw[1]) });
}
for (const identity of sourceIdentities) {
  assert.equal(sha256(readFileSync(resolve(project, identity.file))), identity.sha256, "Source changed");
}
for (const [name, root] of Object.entries(roots)) assert.deepEqual(productFingerprint(root), builds[name].fingerprint);
const valid = rows.filter(row => row.oracleError === null);
const summary = Object.fromEntries(["baseline", "candidate"].map(name => {
  const sum = field => valid.reduce((count, row) => count + row[name][field].length, 0);
  const tp = sum("truePositives"), fp = sum("falsePositives"), fn = sum("falseNegatives");
  return [name, { tp, fp, fn, precision: tp + fp ? tp / (tp + fp) : null,
    recall: tp + fn ? tp / (tp + fn) : null,
    parserRejectedFiles: valid.filter(row => row[name].parserErrors.length > 0).length }];
}));
const report = { schemaVersion: 1, project, repository: git("remote", "get-url", "origin"),
  commit: git("rev-parse", "HEAD"), node: process.version,
  goVersion: execFileSync(resolve(goArg), ["version"], { encoding: "utf8", env }).trim(),
  oracleHelperSha256: sha256(readFileSync(helper)), builds, sourceIdentities,
  scope: "Top-level FuncDecl declarations accepted by official go/parser with a plain named or pointer receiver; exact name, kind, receiver and original UTF-16 range. Other symbol kinds, generic receivers, type checking, call targets, build selection, runtime dispatch and retrieval precision are not scored. Official-parser rejected files remain excluded and listed.",
  files: files.length, oracleAcceptedFiles: valid.length,
  excludedFiles: rows.filter(row => row.oracleError !== null).map(row => ({ file: row.file, error: row.oracleError })),
  unchangedFactFiles: rows.filter(row => row.completeRawFactsEqual).length, summary, rows };
writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ files: report.files, oracleAcceptedFiles: report.oracleAcceptedFiles,
  unchangedFactFiles: report.unchangedFactFiles, summary, output }));
