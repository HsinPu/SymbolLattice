import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { extname, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { SqliteGraphStore } from "../../dist/infrastructure/sqlite/index.js";
import {
  ARTIFACT_FACTS_EXTRACTOR_VERSION,
  PROJECT_RESOLVER_VERSION
} from "../../dist/domain/index.js";
import { SYMBOL_LATTICE_VERSION } from "../../dist/version.js";

export const MARKDOWN_POSITIVE_QUOTAS = Object.freeze({
  file: 50,
  heading: 100,
  containment: 100,
  reference: 50
});

const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown"]);
const INDEXED_SOURCE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".mjs", ".cjs", ".jsx", ".ets", ".vue", ".svelte", ".astro",
  ".razor", ".cshtml", ".py", ".go", ".rs", ".java", ".groovy", ".f", ".for", ".f77",
  ".f90", ".f95", ".f03", ".f08", ".f18", ".ada", ".adb", ".ads", ".php", ".c",
  ".lua", ".luau", ".pas", ".dpr", ".dpk", ".lpr", ".m", ".mm", ".r", ".ex", ".exs",
  ".erl", ".clj", ".pl", ".pm", ".jl", ".hs", ".ml", ".fs", ".nim", ".cpp", ".cc",
  ".cxx", ".hpp", ".hh", ".hxx", ".cs", ".rb", ".kt", ".swift", ".dart", ".scala",
  ".tf", ".tfvars", ".tofu", ".liquid", ".twig", ".sol", ".cfc", ".cfm", ".cfs", ".nix",
  ".vb", ".cbl", ".cob", ".cobol", ".cpy", ".zig", ".yaml", ".yml", ".xml", ".html",
  ".htm", ".jsp", ".jspf", ".jspx", ".tag", ".tagx", ".css", ".properties", ".sh",
  ".bash", ".sql", ".graphql", ".gql", ".graphqls", ".proto", ...MARKDOWN_EXTENSIONS
]);
const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".SymbolLattice",
  "node_modules",
  "target",
  "dist",
  "build",
  "out",
  "coverage"
]);
const MAX_SOURCE_LENGTH = 5_000_000;
const MAX_HEADING_LENGTH = 2_048;
const MAX_LINK_DESTINATION_LENGTH = 4_096;

function slash(value) {
  return value.replaceAll("\\", "/");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex").toUpperCase();
}

function stableHash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function lineRecords(sourceText) {
  const records = [];
  let start = 0;
  for (const match of sourceText.matchAll(/.*(?:\r\n|\n|\r|$)/gu)) {
    const raw = match[0];
    if (raw.length === 0) break;
    const text = raw.replace(/(?:\r\n|\n|\r)$/u, "");
    records.push({ text, start, end: start + text.length, line: records.length + 1 });
    start += raw.length;
  }
  if (records.length === 0 && sourceText.length > 0) {
    records.push({ text: sourceText, start: 0, end: sourceText.length, line: 1 });
  }
  return records;
}

function endpoint(filePath, name, kind, line, column = 1) {
  return { filePath, name, kind, line, column };
}

function occurrence(filePath, line, column = 1) {
  return { filePath, line, column };
}

function factKey(fact) {
  return JSON.stringify([
    fact.project,
    fact.stratum,
    fact.kind,
    fact.source,
    fact.target,
    fact.occurrence
  ]);
}

function retainSmallest(selection, fact, limit) {
  const key = factKey(fact);
  if (selection.some((item) => item.key === key)) return;
  selection.push({ key, hash: stableHash(key), fact });
  selection.sort((left, right) => left.hash.localeCompare(right.hash) || left.key.localeCompare(right.key));
  if (selection.length > limit) selection.length = limit;
}

function isFenceStart(text) {
  const match = /^( {0,3})(`{3,}|~{3,})(.*)$/u.exec(text);
  return match === null ? null : { marker: match[2][0], length: match[2].length };
}

function isFenceClose(text, fence) {
  const pattern = new RegExp(`^ {0,3}${fence.marker}{${fence.length},}\\s*$`, "u");
  return pattern.test(text);
}

function isIndentedCode(text) {
  return text.startsWith("    ") || text.startsWith("\t");
}

function isHtmlBlockStart(text) {
  return /^ {0,3}<(?:[A-Za-z][A-Za-z0-9-]*(?:\s|>|\/)|\/[A-Za-z]|!DOCTYPE|\?)/iu.test(text);
}

function maskInlineCode(text) {
  const characters = text.split("");
  for (let index = 0; index < characters.length; index += 1) {
    if (characters[index] !== "`") continue;
    let length = 1;
    while (characters[index + length] === "`") length += 1;
    const marker = "`".repeat(length);
    const closeOffset = characters.slice(index + length).join("").indexOf(marker);
    if (closeOffset < 0) {
      return null;
    }
    const close = index + length + closeOffset;
    for (let cursor = index; cursor < close + length; cursor += 1) characters[cursor] = " ";
    index = close + length - 1;
  }
  return characters.join("");
}

function hasUnclosedLabelBefore(text, end) {
  let depth = 0;
  for (let index = 0; index < end; index += 1) {
    let backslashes = 0;
    for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) backslashes += 1;
    if (backslashes % 2 === 1) continue;
    if (text[index] === "[") depth += 1;
    else if (text[index] === "]" && depth > 0) depth -= 1;
  }
  return depth > 0;
}

function headingText(raw) {
  const text = raw.trim().replace(/\s+#+\s*$/u, "").trim();
  if (text.length === 0 || text.length > MAX_HEADING_LENGTH) return null;
  return text;
}

function headingQualifiedName(filePath, heading) {
  return `${filePath}#markdown-heading:${heading.ordinal}`;
}

/**
 * Independent, intentionally strict Markdown subset. It does not use the
 * product parser: only ATX/Setext headings, direct hierarchy, and complete
 * inline relative links are admitted as truth.
 */
export function strictMarkdownTruth(filePath, sourceText, options = {}) {
  if (sourceText.length > MAX_SOURCE_LENGTH) return null;
  const records = lineRecords(sourceText);
  const headings = [];
  const opaqueLines = new Set();
  let fence = null;
  let htmlBlock = false;
  let htmlTag = null;
  let htmlComment = false;

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const text = record.text;
    if (fence !== null) {
      opaqueLines.add(index);
      if (isFenceClose(text, fence)) fence = null;
      continue;
    }
    const openingFence = isFenceStart(text);
    if (openingFence !== null) {
      fence = openingFence;
      opaqueLines.add(index);
      continue;
    }
    if (htmlBlock) {
      opaqueLines.add(index);
      if (htmlComment && text.includes("-->")) {
        htmlBlock = false;
        htmlComment = false;
      } else if (htmlTag !== null && new RegExp(`</${htmlTag}\\s*>`, "iu").test(text)) {
        htmlBlock = false;
        htmlTag = null;
      } else if (!htmlComment && htmlTag === null && text.trim().length === 0) {
        htmlBlock = false;
      }
      continue;
    }
    if (/^ {0,3}<!--/u.test(text)) {
      opaqueLines.add(index);
      if (!text.includes("-->")) {
        htmlBlock = true;
        htmlComment = true;
      }
      continue;
    }
    if (isHtmlBlockStart(text)) {
      opaqueLines.add(index);
      const match = /^ {0,3}<(script|pre|style)(?:\s|>|$)/iu.exec(text);
      const tag = match?.[1]?.toLowerCase();
      if (tag !== undefined && !new RegExp(`</${tag}\\s*>`, "iu").test(text)) {
        htmlBlock = true;
        htmlTag = tag;
      } else if (tag === undefined && text.trim().length > 0) {
        htmlBlock = true;
        htmlTag = null;
      }
      continue;
    }
    if (isIndentedCode(text)) {
      opaqueLines.add(index);
      continue;
    }
    const atx = /^( {0,3})(#{1,6})(?:[ \t]+(.*)|[ \t]*)$/u.exec(text);
    if (atx !== null) {
      const name = headingText(atx[3] ?? "");
      if (name !== null) {
        headings.push({
          name,
          level: atx[2].length,
          line: record.line,
          column: atx[1].length + 1,
          start: record.start + atx[1].length,
          end: record.end
        });
      }
      continue;
    }
    const underline = /^( {0,3})(=+|-+)[ \t]*$/u.exec(text);
    const previous = records[index - 1];
    if (underline !== null && previous !== undefined && !opaqueLines.has(index - 1)) {
      const previousText = previous.text;
      const previousTrimmed = previousText.trim();
      if (
        previousTrimmed.length > 0 &&
        !isIndentedCode(previousText) &&
        !/^(?: {0,3})(?:#{1,6})(?:[ \t]+|$)/u.test(previousText)
      ) {
        const name = headingText(previousTrimmed);
        if (name !== null) {
          headings.push({
            name,
            level: underline[2][0] === "=" ? 1 : 2,
            line: previous.line,
            column: 1,
            start: previous.start,
            end: record.end
          });
          opaqueLines.add(index);
        }
      }
    }
  }

  if (fence !== null || htmlBlock) return null;
  headings.sort((left, right) => left.start - right.start);
  headings.forEach((heading, index) => {
    heading.ordinal = index + 1;
    heading.qualifiedName = headingQualifiedName(filePath, heading);
  });

  const file = endpoint(filePath, filePath, "file", 1, 1);
  const headingEndpoints = headings.map((heading) =>
    endpoint(filePath, heading.name, "resource", heading.line, heading.column)
  );
  const containmentFacts = [];
  const stack = [];
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    while (stack.length > 0 && stack.at(-1).level >= heading.level) stack.pop();
    const parent = stack.at(-1);
    const source = parent === undefined
      ? file
      : endpoint(filePath, parent.name, "resource", parent.line, parent.column);
    const target = headingEndpoints[index];
    containmentFacts.push({
      stratum: "containment",
      kind: "contains",
      source,
      target,
      occurrence: occurrence(filePath, heading.line, heading.column),
      parentQualifiedName: parent?.qualifiedName ?? filePath
    });
    stack.push(heading);
  }

  let inlineFailClosed = false;
  const masked = sourceText.split(/(?<=\n)|(?<=\r)(?!\n)/gu).map((line, index) => {
    if (opaqueLines.has(index) || inlineFailClosed) return " ".repeat(line.length);
    const maskedLine = maskInlineCode(line);
    if (maskedLine === null) {
      inlineFailClosed = true;
      return " ".repeat(line.length);
    }
    return maskedLine;
  }).join("");
  const links = [];
  const linkPattern = /(?<![!\\])\[([^\[\]\r\n]{1,2048})\]\(([^\s<>()[\]]{1,4096})\)/gu;
  for (const match of masked.matchAll(linkPattern)) {
    const label = match[1] ?? "";
    const destination = match[2] ?? "";
    const start = match.index ?? 0;
    if (
      label.length === 0 ||
      destination.length === 0 ||
      destination.length > MAX_LINK_DESTINATION_LENGTH ||
      hasUnclosedLabelBefore(masked, start)
    ) continue;
    if (
      destination.startsWith("#") ||
      destination.startsWith("/") ||
      destination.startsWith("\\") ||
      destination.includes("\\") ||
      destination.includes("%") ||
      destination.includes("${") ||
      destination.includes("{{") ||
      destination.includes("<%") ||
      /^(?:[A-Za-z][A-Za-z0-9+.-]*:|\/\/)/u.test(destination)
    ) continue;
    const pathPart = destination.split(/[?#]/u, 1)[0] ?? "";
    if (
      pathPart.length === 0 ||
      !/\.[A-Za-z0-9]+$/u.test(pathPart) ||
      !MARKDOWN_EXTENSIONS.has(extname(pathPart).toLowerCase()) &&
      !/\.[A-Za-z0-9]+$/u.test(pathPart)
    ) continue;
    const sourceLine = sourceText.slice(0, start).split(/\r\n|\n|\r/u).length;
    const sourceHeading = [...headings].reverse().find((heading) => heading.line <= sourceLine);
    const source = sourceHeading === undefined
      ? file
      : endpoint(filePath, sourceHeading.name, "resource", sourceHeading.line, sourceHeading.column);
    const targetPath = slash(normalize(`${dirnameForFile(filePath)}/${pathPart}`)).replace(/^\.\//u, "");
    const normalizedFilePath = slash(filePath);
    const outsideRoot = targetPath === ".." || targetPath.startsWith("../") || targetPath.startsWith("/../");
    links.push({
      source,
      rawDestination: destination,
      pathPart,
      targetPath: outsideRoot ? null : targetPath,
      occurrence: occurrence(filePath, sourceLine, (start - (sourceText.lastIndexOf("\n", start - 1) + 1)) + 1),
      sourcePath: normalizedFilePath,
      outsideRoot
    });
  }

  const knownFiles = options.knownFiles instanceof Set ? options.knownFiles : null;
  const facts = [];
  facts.push({
    stratum: "file",
    kind: "identity",
    source: null,
    target: file,
    occurrence: occurrence(filePath, 1, 1)
  });
  for (const target of headingEndpoints) {
    facts.push({ stratum: "heading", kind: "identity", source: null, target, occurrence: target });
  }
  facts.push(...containmentFacts);
  const references = [];
  for (const link of links) {
    if (link.targetPath === null || knownFiles === null || !knownFiles.has(link.targetPath)) continue;
    const target = endpoint(link.targetPath, link.targetPath, "file", 1, 1);
    const fact = {
      stratum: "reference",
      kind: "references",
      source: link.source,
      target,
      occurrence: link.occurrence,
      referenceName: link.rawDestination
    };
    references.push(fact);
    facts.push(fact);
  }
  return {
    file,
    headings,
    headingEndpoints,
    containments: containmentFacts,
    links,
    references,
    facts
  };
}

function dirnameForFile(filePath) {
  const index = filePath.lastIndexOf("/");
  return index < 0 ? "." : filePath.slice(0, index);
}

async function listFiles(root) {
  const files = [];
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!entry.name.startsWith(".") && !IGNORED_DIRECTORIES.has(entry.name)) {
          await visit(resolve(directory, entry.name));
        }
      } else if (entry.isFile()) {
        files.push(resolve(directory, entry.name));
      }
    }
  };
  await visit(root);
  return files.sort((left, right) => left.localeCompare(right));
}

async function collectCorpus(project, sourceRoot, indexedProjectPath) {
  const root = resolve(sourceRoot);
  const absoluteFiles = await listFiles(root);
  const relativeFiles = absoluteFiles.map((absolute) => slash(relative(root, absolute)));
  const indexedRoot = resolve(indexedProjectPath);
  const indexedFiles = (await listFiles(indexedRoot)).map((absolute) => slash(relative(indexedRoot, absolute)));
  const knownFiles = new Set(indexedFiles.filter((filePath) =>
    INDEXED_SOURCE_EXTENSIONS.has(extname(filePath).toLowerCase())
  ));
  const facts = [];
  const parsedFiles = [];
  let rejectedFiles = 0;
  const manifest = createHash("sha256");
  for (const absolute of absoluteFiles) {
    const filePath = slash(relative(root, absolute));
    const sourceText = await readFile(absolute, "utf8");
    manifest.update(filePath).update("\0").update(sha256(sourceText)).update("\n");
    if (!MARKDOWN_EXTENSIONS.has(extname(filePath).toLowerCase())) continue;
    let truth;
    try {
      truth = strictMarkdownTruth(filePath, sourceText, { knownFiles });
    } catch {
      truth = null;
    }
    if (truth === null) {
      rejectedFiles += 1;
      continue;
    }
    parsedFiles.push(filePath);
    facts.push(...truth.facts.map((fact) => ({ project, ...fact })));
  }
  return {
    facts,
    parsedFiles,
    rejectedFiles,
    files: relativeFiles,
    manifestSha256: manifest.digest("hex").toUpperCase()
  };
}

function endpointCandidates(snapshot, endpoint_) {
  if (!endpoint_) return [];
  const candidates = snapshot.symbols.filter((symbol) => {
    if (symbol.filePath !== endpoint_.filePath || symbol.kind !== endpoint_.kind) return false;
    if (endpoint_.kind === "file") {
      return symbol.qualifiedName === endpoint_.filePath || symbol.name === endpoint_.filePath || symbol.name === endpoint_.filePath.split("/").at(-1);
    }
    return symbol.name === endpoint_.name;
  });
  if (endpoint_.kind === "file") return candidates.length === 1 ? candidates : [];
  const containing = candidates.filter((symbol) => symbol.range.start.line === endpoint_.line);
  return containing;
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
  if (fact.kind === "identity") {
    return targets.length === 1 ? { outcome: "tp" } : { outcome: "fn", reason: `target:${targets.length}` };
  }
  const sources = endpointCandidates(snapshot, fact.source);
  if (sources.length !== 1 || targets.length !== 1) return { outcome: "fn", reason: `endpoints:${sources.length}/${targets.length}` };
  const edges = snapshot.edges.filter((edge) => {
    if (edge.kind !== fact.kind || edge.sourceId !== sources[0].id || edge.targetId !== targets[0].id) return false;
    if (fact.kind === "contains") return true;
    return (
      edge.filePath === fact.occurrence.filePath &&
      edge.range.start.line === fact.occurrence.line &&
      edge.range.start.column === fact.occurrence.column
    );
  });
  const exact = edges.filter((edge) => exactSingleton(edge, targets[0].id));
  if (exact.length === 1) return { outcome: "tp", ruleId: exact[0].evidence?.ruleId ?? null };
  if (edges.length > 0) return { outcome: "invalid", reason: `evidence:${edges.length}` };
  return { outcome: "fn", reason: "missing" };
}

export function scoreMarkdownSelection(selection, snapshots) {
  const positives = selection.map((fact) => ({
    ...fact,
    score: scorePositive(snapshots.get(fact.project), fact)
  }));
  return {
    positives,
    scores: {
      tp: positives.filter((item) => item.score.outcome === "tp").length,
      fp: 0,
      fn: positives.filter((item) => item.score.outcome === "fn").length,
      evidenceInvalid: positives.filter((item) => item.score.outcome === "invalid").length
    }
  };
}

function identityKey(project, symbol) {
  return [project, symbol.filePath, symbol.kind, symbol.name, symbol.range.start.line].join("\u0000");
}

function truthIdentityKey(project, fact) {
  return [project, fact.target.filePath, fact.target.kind, fact.target.name, fact.target.line].join("\u0000");
}

function candidateIdentityKey(candidate) {
  return [candidate.project, candidate.filePath, candidate.kind, candidate.name, candidate.line].join("\u0000");
}

function candidateScan(allFacts, snapshots) {
  const truthIdentities = allFacts.filter((fact) => fact.kind === "identity");
  const truthKeys = new Set(truthIdentities.map((fact) => truthIdentityKey(fact.project, fact)));
  const candidates = [];
  for (const [project, snapshot] of snapshots) {
    for (const symbol of snapshot.symbols.filter((item) => item.kind === "file" || item.kind === "resource")) {
      const key = identityKey(project, symbol);
      candidates.push({
        project,
        filePath: symbol.filePath,
        kind: symbol.kind,
        name: symbol.kind === "file" ? symbol.filePath : symbol.name,
        line: symbol.range.start.line,
        outcome: truthKeys.has(key) ? "tp" : "fp"
      });
    }
  }
  const scoredFacts = allFacts.map((fact) => scorePositive(snapshots.get(fact.project), fact));
  const falseNegatives = allFacts
    .map((fact, index) => ({ fact, score: scoredFacts[index] }))
    .filter((item) => item.score.outcome === "fn")
    .slice(0, 100);
  const expected = truthIdentities;
  const tp = candidates.filter((candidate) => candidate.outcome === "tp").length;
  const candidateKeys = new Set(candidates.map(candidateIdentityKey));
  const fn = expected.filter((fact) => !candidateKeys.has(truthIdentityKey(fact.project, fact))).length;
  const identityFalseNegativeSamples = expected
    .filter((fact) => !candidateKeys.has(truthIdentityKey(fact.project, fact)))
    .slice(0, 100)
    .map((fact) => ({ project: fact.project, target: fact.target }));
  return {
    positiveCount: allFacts.length,
    tp: scoredFacts.filter((score) => score.outcome === "tp").length,
    fp: null,
    identityCandidateExtras: candidates.length - tp,
    fn: scoredFacts.filter((score) => score.outcome === "fn").length,
    identityFalseNegatives: fn,
    identityFalseNegativeSamples,
    evidenceInvalid: scoredFacts.filter((score) => score.outcome === "invalid").length,
    unsupportedBreadthRecall: allFacts.length === 0
      ? null
      : Number((scoredFacts.filter((score) => score.outcome === "tp").length / allFacts.length).toFixed(6)),
    falseNegatives,
    candidates: candidates.slice(0, 5_000)
  };
}

function chooseFacts(allFacts) {
  const strata = Object.keys(MARKDOWN_POSITIVE_QUOTAS);
  const ranked = new Map(strata.map((stratum) => [
    stratum,
    allFacts
      .filter((fact) => fact.stratum === stratum)
      .map((fact) => ({ key: factKey(fact), hash: stableHash(factKey(fact)), fact }))
      .sort((left, right) => left.hash.localeCompare(right.hash) || left.key.localeCompare(right.key))
  ]));
  const selected = new Map(strata.map((stratum) => [stratum, []]));
  const counts = new Map();
  for (const stratum of strata) {
    for (const candidate of ranked.get(stratum) ?? []) {
      if ((selected.get(stratum)?.length ?? 0) >= MARKDOWN_POSITIVE_QUOTAS[stratum]) break;
      selected.get(stratum).push(candidate);
      counts.set(candidate.fact.project, (counts.get(candidate.fact.project) ?? 0) + 1);
    }
  }
  const projects = [...new Set(allFacts.map((fact) => fact.project))].sort();
  while (projects.some((project) => (counts.get(project) ?? 0) > 120)) {
    const donorProject = projects.find((project) => (counts.get(project) ?? 0) > 120);
    let swapped = false;
    for (const stratum of strata) {
      const items = selected.get(stratum) ?? [];
      const donorIndex = items.findLastIndex((item) => item.fact.project === donorProject);
      if (donorIndex < 0) continue;
      const selectedKeys = new Set(items.map((item) => item.key));
      const replacement = (ranked.get(stratum) ?? []).find(
        (item) =>
          item.fact.project !== donorProject &&
          (counts.get(item.fact.project) ?? 0) < 120 &&
          !selectedKeys.has(item.key)
      );
      if (replacement === undefined) continue;
      items[donorIndex] = replacement;
      counts.set(donorProject, (counts.get(donorProject) ?? 0) - 1);
      counts.set(replacement.fact.project, (counts.get(replacement.fact.project) ?? 0) + 1);
      swapped = true;
      break;
    }
    if (!swapped) break;
  }
  for (const project of projects) {
    while ((counts.get(project) ?? 0) < 80) {
      let swapped = false;
      for (const stratum of strata) {
        const already = new Set((selected.get(stratum) ?? []).map((item) => item.key));
        const replacement = (ranked.get(stratum) ?? []).find(
          (item) => item.fact.project === project && !already.has(item.key)
        );
        const donorIndex = (selected.get(stratum) ?? []).findLastIndex(
          (item) => item.fact.project !== project && (counts.get(item.fact.project) ?? 0) > 80
        );
        if (replacement === undefined || donorIndex < 0) continue;
        const donor = selected.get(stratum)[donorIndex];
        selected.get(stratum)[donorIndex] = replacement;
        counts.set(donor.fact.project, (counts.get(donor.fact.project) ?? 0) - 1);
        counts.set(project, (counts.get(project) ?? 0) + 1);
        swapped = true;
        break;
      }
      if (!swapped) break;
    }
  }
  return [...selected.values()].flatMap((items) => items.map((item) => item.fact));
}

function parseArguments(arguments_) {
  const options = { corpora: [], commits: new Map() };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    const value = arguments_[index + 1];
    if (argument === "--corpus" && value) {
      const [name, sourcePath, indexedProjectPath] = value.split("=");
      if (!name || !sourcePath || !indexedProjectPath) throw new Error(`Invalid corpus: ${value}`);
      options.corpora.push({ name, sourcePath: resolve(sourcePath), indexedProjectPath: resolve(indexedProjectPath) });
      index += 1;
    } else if (argument === "--commit" && value) {
      const [name, commit] = value.split("=");
      if (!name || !commit) throw new Error(`Invalid commit: ${value}`);
      options.commits.set(name, commit);
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

export async function runMarkdownOracle({ corpora, output }) {
  const allFacts = [];
  const corpusStats = {};
  const sourceManifests = {};
  for (const corpus of corpora) {
    const result = await collectCorpus(corpus.name, corpus.sourcePath, corpus.indexedProjectPath);
    allFacts.push(...result.facts);
    corpusStats[corpus.name] = {
      markdownFiles: result.parsedFiles.length + result.rejectedFiles,
      parsedFiles: result.parsedFiles.length,
      rejectedFiles: result.rejectedFiles,
      files: result.files.length
    };
    sourceManifests[corpus.name] = {
      root: corpus.sourcePath,
      commit: corpus.commit ?? null,
      contentManifestSha256: result.manifestSha256,
      selectedMarkdownPathsSha256: sha256(result.parsedFiles.join("\n"))
    };
  }
  const positives = chooseFacts(allFacts);
  const positiveCounts = Object.fromEntries(Object.keys(MARKDOWN_POSITIVE_QUOTAS).map((stratum) => [
    stratum,
    positives.filter((fact) => fact.stratum === stratum).length
  ]));
  const selectedCorpusCounts = Object.fromEntries(corpora.map((corpus) => [
    corpus.name,
    positives.filter((fact) => fact.project === corpus.name).length
  ]));
  const missingStrata = Object.entries(MARKDOWN_POSITIVE_QUOTAS)
    .filter(([stratum, quota]) => positiveCounts[stratum] < quota)
    .map(([stratum, expected]) => ({ stratum, expected, actual: positiveCounts[stratum] }));
  const store = new SqliteGraphStore({ readOnly: true });
  try {
    const snapshots = new Map(corpora.map((corpus) => [corpus.name, store.getSnapshot(corpus.indexedProjectPath)]));
    const scored = scoreMarkdownSelection(positives, snapshots);
    const candidate = candidateScan(allFacts, snapshots);
    const outputValue = {
      schemaVersion: 1,
      benchmark: "symbollattice-markdown-large-project-correctness-v1",
      generatedAt: new Date().toISOString(),
      packageVersion: SYMBOL_LATTICE_VERSION,
      extractorVersion: ARTIFACT_FACTS_EXTRACTOR_VERSION,
      resolverVersion: PROJECT_RESOLVER_VERSION,
      oracle: {
        parser: "independent-strict-markdown-subset",
        version: "v1",
        methodology: "deterministic-stratified-file-heading-containment-relative-reference-sample",
        admittedSyntax: ["ATX headings", "Setext headings", "direct heading hierarchy", "unique relative inline file links"],
        rejectedSyntax: ["fenced/indented/inline code", "HTML blocks/comments", "reference links", "external/root-relative/extensionless/dynamic links", "MDX"]
      },
      quotas: MARKDOWN_POSITIVE_QUOTAS,
      positiveCounts,
      selectedCorpusCounts,
      missingStrata,
      corpusStats,
      sourceManifests,
      candidateScan: candidate,
      status:
        missingStrata.length === 0 &&
        Object.values(selectedCorpusCounts).every((count) => count >= 80 && count <= 120) &&
        scored.scores.fn === 0 &&
        scored.scores.evidenceInvalid === 0
          ? "complete"
          : "inconclusive",
      ...scored
    };
    await writeFile(output, `${JSON.stringify(outputValue, null, 2)}\n`, "utf8");
    return outputValue;
  } finally {
    store.close();
  }
}

function mainArguments() {
  const options = parseArguments(process.argv.slice(2));
  return {
    ...options,
    corpora: options.corpora.map((corpus) => ({
      ...corpus,
      commit: options.commits.get(corpus.name) ?? null
    }))
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMarkdownOracle(mainArguments()).then((report) => {
    process.stdout.write(`${JSON.stringify({
      status: report.status,
      scores: report.scores,
      positiveCounts: report.positiveCounts,
      selectedCorpusCounts: report.selectedCorpusCounts,
      candidateScan: {
        positiveCount: report.candidateScan.positiveCount,
        tp: report.candidateScan.tp,
        fn: report.candidateScan.fn,
        evidenceInvalid: report.candidateScan.evidenceInvalid,
        unsupportedBreadthRecall: report.candidateScan.unsupportedBreadthRecall
      }
    }, null, 2)}\n`);
    if (report.status !== "complete") process.exitCode = 2;
  }).catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
