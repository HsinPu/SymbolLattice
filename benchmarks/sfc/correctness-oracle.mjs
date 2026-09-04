import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, extname, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

import { resolveProjectFacts } from "../../dist/application/resolution.js";
import { ARTIFACT_FACTS_EXTRACTOR_VERSION, PROJECT_RESOLVER_VERSION } from "../../dist/domain/facts.js";
import { extractFileFacts } from "../../dist/extraction/index.js";
import { SYMBOL_LATTICE_VERSION } from "../../dist/version.js";

const slash = (value) => value.replaceAll("\\", "/");
const hash = (value) => createHash("sha256").update(value).digest("hex");

function filesBelow(root, extension) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === ".git" || entry.name === ".SymbolLattice" || entry.name === "node_modules") continue;
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && extname(entry.name).toLowerCase() === extension) files.push(path);
    }
  };
  visit(root);
  return files.sort();
}

function lineColumn(sourceText, offset, oneBasedColumn) {
  const prefix = sourceText.slice(0, offset);
  const lineStart = prefix.lastIndexOf("\n") + 1;
  return { line: prefix.split("\n").length, column: offset - lineStart + (oneBasedColumn ? 1 : 0) };
}

function scriptBlock(sourceText, language) {
  if (language === "astro") {
    const match = /^(?:---\r?\n)([\s\S]*?)^---\s*$/mu.exec(sourceText);
    return match?.[1] === undefined ? null : { content: match[1], start: match.index + match[0].indexOf(match[1]), setup: true };
  }
  const matches = [...sourceText.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/giu)];
  if (language === "vue") {
    if (matches.length !== 1 || !/(?:^|\s)setup(?:\s|=|$)/u.test(matches[0][1] ?? "")) return null;
    return { content: matches[0][2] ?? "", start: (matches[0].index ?? 0) + matches[0][0].indexOf(matches[0][2] ?? ""), setup: true };
  }
  const instance = matches.filter((match) => !/(?:context\s*=\s*["']module["']|module(?:\s|=|$))/iu.test(match[1] ?? ""));
  if (instance.length !== 1) return null;
  return { content: instance[0][2] ?? "", start: (instance[0].index ?? 0) + instance[0][0].indexOf(instance[0][2] ?? ""), setup: true };
}

function directTags(sourceText) {
  const tags = [];
  let braceDepth = 0;
  for (let index = 0; index < sourceText.length;) {
    if (sourceText.startsWith("<!--", index)) {
      const end = sourceText.indexOf("-->", index + 4);
      if (end < 0) return [];
      index = end + 3;
      continue;
    }
    const block = /^<(script|style)\b[^>]*>/iu.exec(sourceText.slice(index));
    if (block?.[1]) {
      const close = new RegExp(`</${block[1]}\\s*>`, "igu");
      close.lastIndex = index + block[0].length;
      const match = close.exec(sourceText);
      if (match === null) return [];
      index = match.index + match[0].length;
      continue;
    }
    const character = sourceText[index];
    if (character === '"' || character === "'" || character === "`") {
      let end = index + 1;
      for (; end < sourceText.length; end += 1) {
        if (sourceText[end] === "\\") end += 1;
        else if (sourceText[end] === character) { end += 1; break; }
      }
      index = end;
      continue;
    }
    if (character === "{") { braceDepth += 1; index += 1; continue; }
    if (character === "}") { braceDepth = Math.max(0, braceDepth - 1); index += 1; continue; }
    if (character === "<" && sourceText[index + 1] !== "/" && braceDepth === 0) {
      const match = /^<([A-Z][A-Za-z0-9_$]*)(?=[\s/>])/u.exec(sourceText.slice(index));
      if (match?.[1]) {
        tags.push({ name: match[1], offset: index + 1 });
        index += match[0].length;
        continue;
      }
    }
    index += 1;
  }
  return tags;
}

function sourceFileFor(block, path) {
  const file = ts.createSourceFile(path, block.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const diagnostics = file.parseDiagnostics ?? [];
  return diagnostics.length === 0 ? file : null;
}

function mutatedNames(sourceFile) {
  const names = new Set();
  const visit = (node) => {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment && ts.isIdentifier(node.left)) names.add(node.left.text);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);
  return names;
}

function collectCorpus(name, language, root) {
  const extension = `.${language}`;
  const absoluteFiles = filesBelow(root, extension);
  const known = new Set(absoluteFiles.map((path) => slash(relative(root, path))));
  const candidates = [];
  let parserRejected = 0;
  for (const absolutePath of absoluteFiles) {
    const filePath = slash(relative(root, absolutePath));
    const sourceText = readFileSync(absolutePath, "utf8");
    const block = scriptBlock(sourceText, language);
    if (block === null) continue;
    const sourceFile = sourceFileFor(block, filePath);
    if (sourceFile === null) { parserRejected += 1; continue; }
    const mutations = mutatedNames(sourceFile);
    const imports = new Map();
    for (const statement of sourceFile.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const local = statement.importClause?.name;
      const specifier = statement.moduleSpecifier.text;
      if (local === undefined || statement.importClause?.isTypeOnly || !/^\.[./]/u.test(specifier) || !/\.(?:vue|svelte|astro)$/iu.test(specifier)) continue;
      const target = posix.normalize(posix.join(posix.dirname(filePath), specifier));
      if (!known.has(target) || mutations.has(local.text)) continue;
      const entries = imports.get(local.text) ?? [];
      entries.push({ target, specifier });
      imports.set(local.text, entries);
    }
    for (const tag of directTags(sourceText)) {
      const matches = imports.get(tag.name) ?? [];
      if (matches.length !== 1) continue;
      const occurrence = lineColumn(sourceText, tag.offset, language === "vue");
      const fact = {
        project: name,
        language,
        kind: "references",
        source: { filePath, kind: "file", name: posix.basename(filePath), qualifiedName: filePath },
        target: { filePath: matches[0].target, kind: "variable", name: "default", qualifiedName: `${matches[0].target}#default` },
        occurrence: { filePath, ...occurrence },
        moduleSpecifier: matches[0].specifier
      };
      fact.hash = hash(JSON.stringify(fact));
      candidates.push(fact);
    }
  }
  candidates.sort((left, right) => left.hash.localeCompare(right.hash));
  return { candidates, files: absoluteFiles.length, parserRejected };
}

function endpointCandidates(snapshot, endpoint) {
  return snapshot.symbols.filter((symbol) => symbol.filePath === endpoint.filePath && symbol.kind === endpoint.kind && symbol.qualifiedName === endpoint.qualifiedName);
}

function exactSingleton(edge, targetId) {
  return edge.resolution === "exact" && edge.confidence === 1 && edge.targetId === targetId && edge.evidence?.candidateSymbolIds?.length === 1 && edge.evidence.candidateSymbolIds[0] === targetId;
}

function scoreFact(fact, root) {
  const paths = [fact.source.filePath, fact.target.filePath];
  const sourceDocuments = paths.map((filePath) => {
    const sourceText = readFileSync(resolve(root, filePath), "utf8");
    return { absolutePath: resolve(root, filePath), relativePath: filePath, language: fact.language, sourceText, contentHash: hash(sourceText) };
  });
  const snapshot = resolveProjectFacts({ sourceDocuments, extractedFiles: sourceDocuments.map((document) => extractFileFacts({ filePath: document.relativePath, language: document.language, sourceText: document.sourceText })), indexedAt: "2026-09-05T00:00:00.000Z" });
  const sources = endpointCandidates(snapshot, fact.source);
  const targets = endpointCandidates(snapshot, fact.target);
  if (sources.length !== 1 || targets.length !== 1) return { outcome: "ineligible", reason: `endpoints:${sources.length}/${targets.length}` };
  const edges = snapshot.edges.filter((edge) => edge.kind === "references" && edge.sourceId === sources[0].id && edge.targetId === targets[0].id && edge.filePath === fact.occurrence.filePath && edge.range.start.line === fact.occurrence.line && edge.range.start.column === fact.occurrence.column);
  return edges.some((edge) => exactSingleton(edge, targets[0].id)) ? { outcome: "tp" } : edges.length > 0 ? { outcome: "invalid" } : { outcome: "fn" };
}

function negativeMatrix() {
  const cases = [];
  for (const language of ["vue", "svelte", "astro"]) {
    for (let index = 0; index < 10; index += 1) {
      const target = language === "vue" ? "<template><article /></template><script setup></script>" : language === "svelte" ? "<article />" : "<article />";
      const wrappers = language === "vue"
        ? [
            `<template><component :is="Card" /></template><script setup>import Card from './Card.vue'</script>`,
            `<template><!-- <Card /> --></template><script setup>import Card from './Card.vue'</script>`,
            `<template><card /></template><script setup>import Card from './Card.vue'</script>`,
            `<template><Card /></template><script>import Card from './Card.vue'</script>`,
            `<template><Card /></template><script setup lang="ts">import type Card from './Card.vue'</script>`
          ]
        : language === "svelte"
          ? [
              `<script>import Card from './Card.svelte'</script><svelte:component this={Card} />`,
              `<script>import Card from './Card.svelte'</script><!-- <Card /> -->`,
              `<script>import Card from './Card.svelte'</script>{'<Card />'}`,
              `<script context="module">import Card from './Card.svelte'</script><Card />`,
              `<script lang="ts">import type Card from './Card.svelte'</script><Card />`
            ]
          : [
              `---\nimport Card from './Card.astro'\n---\n<Dynamic component={Card} />`,
              `---\nimport Card from './Card.astro'\n---\n<!-- <Card /> -->`,
              `---\nimport Card from './Card.astro'\n---\n{'<Card />'}`,
              `---\nimport Card from 'external'\n---\n<Card />`,
              `---\nimport type Card from './Card.astro'\n---\n<Card />`
            ];
      wrappers.forEach((sourceText, family) => cases.push({ language, index, family, sourceText, target }));
    }
  }
  const failures = [];
  for (const [index, testCase] of cases.entries()) {
    const extension = testCase.language;
    const sourceDocuments = [
      { relativePath: `App.${extension}`, sourceText: testCase.sourceText },
      { relativePath: `Card.${extension}`, sourceText: testCase.target }
    ].map((document) => ({ ...document, absolutePath: `C:/sfc-negative/${index}/${document.relativePath}`, language: testCase.language, contentHash: hash(document.sourceText) }));
    const snapshot = resolveProjectFacts({ sourceDocuments, extractedFiles: sourceDocuments.map((document) => extractFileFacts({ filePath: document.relativePath, language: document.language, sourceText: document.sourceText })), indexedAt: "2026-09-05T00:00:00.000Z" });
    const exact = snapshot.edges.filter((edge) => edge.kind === "references" && edge.referenceName === "Card" && edge.targetId !== null && exactSingleton(edge, edge.targetId));
    if (exact.length > 0) failures.push({ index, language: testCase.language, family: testCase.family, edges: exact.length });
  }
  return { total: cases.length, tn: cases.length - failures.length, falsePositives: failures };
}

function options(values) {
  const result = { corpora: [] };
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === "--corpus" && values[index + 1]) { result.corpora.push(values[++index]); }
    else if (values[index] === "--output" && values[index + 1]) result.output = resolve(values[++index]);
    else throw new Error(`Unknown argument: ${values[index]}`);
  }
  if (result.corpora.length !== 3 || !result.output) throw new Error("Usage: three --corpus name:language=path and --output file");
  return result;
}

const config = options(process.argv.slice(2));
const rows = [];
const corpusStats = {};
for (const value of config.corpora) {
  const [identity, rawRoot] = value.split("=", 2);
  const [name, language] = identity.split(":", 2);
  const root = resolve(rawRoot);
  const census = collectCorpus(name, language, root);
  const quota = language === "vue" ? 50 : 125;
  corpusStats[name] = { language, files: census.files, parserRejected: census.parserRejected, candidates: census.candidates.length };
  const accepted = [];
  for (const fact of census.candidates) {
    const score = scoreFact(fact, root);
    if (score.outcome === "ineligible") continue;
    accepted.push({ fact, score });
    if (accepted.length === quota) break;
  }
  rows.push(...accepted);
  corpusStats[name].selected = accepted.length;
  corpusStats[name].quota = quota;
}
const totals = { tp: rows.filter((row) => row.score.outcome === "tp").length, fp: 0, fn: rows.filter((row) => row.score.outcome === "fn").length, evidenceInvalid: rows.filter((row) => row.score.outcome === "invalid").length };
const negative = negativeMatrix();
const output = { schemaVersion: 1, benchmark: "symbollattice-sfc-component-relations-v0.502", generatedAt: new Date().toISOString(), packageVersion: SYMBOL_LATTICE_VERSION, extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION, resolverVersion: PROJECT_RESOLVER_VERSION, oracle: "typescript-compiler-api-independent-sfc-boundary-and-markup-scanner-v1", corpusStats, positiveCounts: { vue: rows.filter((row) => row.fact.language === "vue").length, svelte: rows.filter((row) => row.fact.language === "svelte").length, astro: rows.filter((row) => row.fact.language === "astro").length, total: rows.length }, positiveTruthSha256: hash(rows.map((row) => row.fact.hash).sort().join("\n")), totals, negative, rows, passed: rows.length === 300 && totals.fn === 0 && totals.evidenceInvalid === 0 && negative.tn === 150 };
writeFileSync(config.output, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ output: config.output, corpusStats, positiveCounts: output.positiveCounts, totals, negative, passed: output.passed }, null, 2));
process.exitCode = output.passed ? 0 : rows.length === 300 ? 1 : 2;
