import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parser as pythonParser } from "@lezer/python";

import { resolveProjectFacts } from "../../dist/application/resolution.js";
import { ARTIFACT_FACTS_EXTRACTOR_VERSION, PROJECT_RESOLVER_VERSION } from "../../dist/domain/facts.js";
import { extractFileFacts } from "../../dist/extraction/index.js";
import { SYMBOL_LATTICE_VERSION } from "../../dist/version.js";

const slash = (value) => value.replaceAll("\\", "/");
const stableHash = (value) => createHash("sha256").update(value).digest("hex");

function hasLezerSyntaxError(sourceText) {
  const cursor = pythonParser.parse(sourceText).cursor();
  do {
    if (cursor.type.isError) return true;
  } while (cursor.next());
  return false;
}

function filesBelow(root, include) {
  const output = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && include(path)) output.push(path);
    }
  };
  visit(root);
  return output.sort();
}

function documents(root, paths) {
  return paths.map((absolutePath) => {
    const sourceText = readFileSync(absolutePath, "utf8");
    return {
      absolutePath,
      relativePath: slash(relative(root, absolutePath)),
      language: "python",
      sourceText,
      contentHash: stableHash(sourceText)
    };
  });
}

function snapshotFor(root, paths) {
  const sourceDocuments = documents(root, paths);
  return resolveProjectFacts({
    sourceDocuments,
    extractedFiles: sourceDocuments.map((document) => extractFileFacts({
      filePath: document.relativePath,
      language: "python",
      sourceText: document.sourceText
    })),
    indexedAt: "2026-09-05T00:00:00.000Z"
  });
}

function endpointCandidates(snapshot, endpoint) {
  return snapshot.symbols.filter((symbol) =>
    symbol.filePath === endpoint.filePath &&
    symbol.kind === endpoint.kind &&
    symbol.name === endpoint.name &&
    (endpoint.qualifiedName === undefined || symbol.qualifiedName === endpoint.qualifiedName)
  );
}

function exactSingleton(edge, targetId) {
  return edge.resolution === "exact" && edge.confidence === 1 && edge.targetId === targetId &&
    edge.evidence?.candidateSymbolIds?.length === 1 && edge.evidence.candidateSymbolIds[0] === targetId;
}

function scoreFact(snapshot, fact) {
  if (fact.subtype === "identity" || fact.stratum === "identity") {
    return endpointCandidates(snapshot, fact.target).length === 1 ? "tp" : "fn";
  }
  const sources = endpointCandidates(snapshot, fact.source);
  const targets = endpointCandidates(snapshot, fact.target);
  if (sources.length !== 1 || targets.length !== 1) return "fn";
  const kind = fact.expected?.edge?.kind ?? fact.kind ?? fact.occurrence?.kind;
  const occurrence = fact.occurrence;
  const matches = snapshot.edges.filter((edge) =>
    edge.kind === kind && edge.sourceId === sources[0].id && edge.targetId === targets[0].id &&
    (kind === "contains" || (
      edge.filePath === occurrence.filePath &&
      edge.range.start.line === (occurrence.range?.start?.line ?? occurrence.line) &&
      edge.range.start.column === (occurrence.range?.start?.column ?? occurrence.column)
    ))
  );
  return matches.some((edge) => exactSingleton(edge, targets[0].id))
    ? "tp"
    : matches.length > 0 ? "invalid" : "fn";
}

function scoreFacts(snapshot, facts) {
  const rows = facts.map((fact) => ({ fact, outcome: scoreFact(snapshot, fact) }));
  return {
    rows,
    totals: {
      tp: rows.filter((row) => row.outcome === "tp").length,
      fp: 0,
      fn: rows.filter((row) => row.outcome === "fn").length,
      evidenceInvalid: rows.filter((row) => row.outcome === "invalid").length
    }
  };
}

function memberNegativeMatrix() {
  const templates = [
    ["decorated-class", (i) => `@decorate\nclass C${i}:\n def target(self): pass\n def run(self): return self.target()`],
    ["decorated-target", (i) => `class C${i}:\n @decorate\n def target(self): pass\n def run(self): return self.target()`],
    ["decorated-caller", (i) => `class C${i}:\n def target(self): pass\n @decorate\n def run(self): return self.target()`],
    ["rebound-self", (i) => `class C${i}:\n def target(self): pass\n def run(self):\n  self = other\n  return self.target()`],
    ["deleted-self", (i) => `class C${i}:\n def target(self): pass\n def run(self):\n  del self\n  return self.target()`],
    ["setattr", (i) => `class C${i}:\n def target(self): pass\n def run(self):\n  setattr(self, 'target', other)\n  return self.target()`],
    ["delattr", (i) => `class C${i}:\n def target(self): pass\n def run(self):\n  delattr(self, 'target')\n  return self.target()`],
    ["getattr-hook", (i) => `class C${i}:\n def __getattr__(self, name): return other\n def target(self): pass\n def run(self): return self.target()`],
    ["getattribute-hook", (i) => `class C${i}:\n def __getattribute__(self, name): return other\n def target(self): pass\n def run(self): return self.target()`],
    ["setattr-hook", (i) => `class C${i}:\n def __setattr__(self, name, value): pass\n def target(self): pass\n def run(self): return self.target()`],
    ["metaclass", (i) => `class C${i}(metaclass=Meta):\n def target(self): pass\n def run(self): return self.target()`],
    ["non-self-receiver", (i) => `class C${i}:\n def target(self): pass\n def run(self, value): return value.target()`],
    ["classmethod-receiver", (i) => `class C${i}:\n def target(self): pass\n @classmethod\n def run(cls): return cls.target()`],
    ["external-monkey-patch", (i) => `class C${i}:\n def target(self): pass\n def run(self): return self.target()\nC${i}.target = other`],
    ["duplicate-target", (i) => `class C${i}:\n def target(self): pass\n def target(self, value): pass\n def run(self): return self.target()`]
  ];
  const failures = [];
  let total = 0;
  for (const [category, render] of templates) {
    for (let index = 0; index < 10; index += 1) {
      total += 1;
      const sourceText = render(index);
      const facts = extractFileFacts({ filePath: `negative/${category}-${index}.py`, language: "python", sourceText });
      const exact = facts.edges.filter((edge) =>
        edge.evidence?.ruleId === "syntax.python.same-class.unique-direct-self-member-call" &&
        exactSingleton(edge, edge.targetId)
      );
      if (exact.length > 0) failures.push({ category, index, edges: exact.length });
    }
  }
  return { total, tn: total - failures.length, falsePositives: failures };
}

function parseArguments(values) {
  const options = { corpora: [] };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index + 1];
    if (values[index] === "--corpus" && value) { options.corpora.push(value); index += 1; }
    else if (values[index] === "--legacy-truth" && value) { options.legacyTruth = resolve(value); index += 1; }
    else if (values[index] === "--legacy-mini" && value) { options.legacyMini = resolve(value); index += 1; }
    else if (values[index] === "--python" && value) { options.python = resolve(value); index += 1; }
    else if (values[index] === "--output" && value) { options.output = resolve(value); index += 1; }
    else throw new Error(`Unknown or incomplete argument: ${values[index]}`);
  }
  if (!options.output || !options.python || !options.legacyTruth || !options.legacyMini || options.corpora.length !== 3) {
    throw new Error("Expected --python, three --corpus name=path, --legacy-truth, --legacy-mini, and --output");
  }
  return options;
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const temporary = mkdtempSync(resolve(tmpdir(), "symbollattice-python-oracle-"));
  const memberTruthPath = resolve(temporary, "member-truth.json");
  const oracleScript = resolve(dirname(fileURLToPath(import.meta.url)), "PythonOracle.py");
  execFileSync(options.python, [oracleScript, ...options.corpora.flatMap((corpus) => ["--corpus", corpus]), "--output", memberTruthPath], { stdio: "pipe", windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  const memberTruth = JSON.parse(readFileSync(memberTruthPath, "utf8"));
  const legacyTruth = JSON.parse(readFileSync(options.legacyTruth, "utf8"));
  const legacyPaths = filesBelow(options.legacyMini, (path) => path.endsWith(".py") && !slash(path).includes("/negative-fixtures/"));
  const legacySnapshot = snapshotFor(options.legacyMini, legacyPaths);
  const legacy = scoreFacts(legacySnapshot, legacyTruth.positive);
  const memberRows = [];
  const admittedByProject = new Map(options.corpora.map((value, index) => [value.slice(0, value.indexOf("=")), { quota: [14, 13, 13][index], rows: [] }]));
  const extractedByPath = new Map();
  for (const fact of memberTruth.positives) {
    const corpusValue = options.corpora.find((value) => value.startsWith(`${fact.project}=`));
    const corpusRoot = resolve(corpusValue.slice(corpusValue.indexOf("=") + 1));
    const sourceRelative = fact.occurrence.filePath.slice(fact.project.length + 1);
    const absolutePath = resolve(corpusRoot, sourceRelative);
    let extracted = extractedByPath.get(absolutePath);
    if (extracted === undefined) {
      const sourceText = readFileSync(absolutePath, "utf8");
      extracted = {
        ...extractFileFacts({ filePath: fact.occurrence.filePath, language: "python", sourceText }),
        parserRejected: hasLezerSyntaxError(sourceText)
      };
      extractedByPath.set(absolutePath, extracted);
    }
    const admission = admittedByProject.get(fact.project);
    if (
      admission.rows.length < admission.quota &&
      extracted.parserRejected === false &&
      endpointCandidates(extracted, fact.source).length === 1 &&
      endpointCandidates(extracted, fact.target).length === 1
    ) {
      admission.rows.push(fact);
      memberRows.push(...scoreFacts({ symbols: extracted.symbols, edges: extracted.edges }, [fact]).rows);
    }
  }
  const admissionShortages = [...admittedByProject].flatMap(([project, value]) =>
    value.rows.length === value.quota ? [] : [{ project, expected: value.quota, actual: value.rows.length }]
  );
  const member = {
    rows: memberRows,
    totals: {
      tp: memberRows.filter((row) => row.outcome === "tp").length,
      fp: 0,
      fn: memberRows.filter((row) => row.outcome === "fn").length,
      evidenceInvalid: memberRows.filter((row) => row.outcome === "invalid").length
    }
  };
  const negative = memberNegativeMatrix();
  const totals = {
    tp: legacy.totals.tp + member.totals.tp,
    fp: 0,
    fn: legacy.totals.fn + member.totals.fn,
    evidenceInvalid: legacy.totals.evidenceInvalid + member.totals.evidenceInvalid
  };
  const output = {
    schemaVersion: 1,
    benchmark: "symbollattice-python-relation-truth-v0.501",
    generatedAt: new Date().toISOString(),
    packageVersion: SYMBOL_LATTICE_VERSION,
    extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION,
    resolverVersion: PROJECT_RESOLVER_VERSION,
    oracle: { legacy: legacyTruth.oracle, member: memberTruth.oracle },
    sourceStats: memberTruth.stats,
    legacyTruthSha256: stableHash(readFileSync(options.legacyTruth)),
    memberTruthSha256: memberTruth.positiveTruthSha256,
    positiveCounts: { legacy: legacyTruth.positive.length, memberCall: memberRows.length, total: legacyTruth.positive.length + memberRows.length },
    memberAdmission: { policy: "oracle-hash-order-with-singleton-product-identity-endpoints-only", shortages: admissionShortages },
    legacy,
    member,
    totals,
    negative,
    passed: admissionShortages.length === 0 && totals.fp === 0 && totals.fn === 0 && totals.evidenceInvalid === 0 && negative.tn === 150
  };
  writeFileSync(options.output, `${JSON.stringify(output, null, 2)}\n`);
  rmSync(temporary, { recursive: true, force: true });
  console.log(JSON.stringify({ output: options.output, positiveCounts: output.positiveCounts, totals, negative, passed: output.passed }, null, 2));
  process.exitCode = output.passed ? 0 : 1;
}

main();
