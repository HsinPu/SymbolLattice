import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import postcss from "postcss";

const MAX_SOURCE_LENGTH = 5_000_000;
const MAX_DEPTH = 256;
const MAX_NODES = 100_000;
const MAX_RESOURCES = 50_000;
const MAX_SELECTOR = 2_048;
const MAX_PROPERTY_NAME = 256;
const MAX_PROPERTY_VALUE = 8_192;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex").toUpperCase();
}

function normalizedSpace(value) {
  return value.trim().replace(/\s+/gu, " ");
}

function declarationGroup(propertyName) {
  const property = propertyName.toLowerCase();
  if (/^(?:color|background|border|box-shadow|fill|stroke|opacity)/u.test(property)) return "color";
  if (/^(?:display|position|inset|top|right|bottom|left|float|clear|overflow|z-index|box-sizing|width|height|min-|max-|margin|padding|gap|grid|flex|align|justify|place-)/u.test(property)) return "layout";
  if (/^(?:font|line-height|letter-spacing|text-|white-space|word-)/u.test(property)) return "typography";
  if (/^(?:animation|transition|transform)/u.test(property)) return "animation";
  return property.startsWith("--") ? "custom-property" : null;
}

function splitSelectors(value) {
  const selectors = [];
  let start = 0;
  let quote = null;
  let comment = false;
  const stack = [];
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    const next = value[index + 1];
    if (comment) {
      if (character === "*" && next === "/") {
        comment = false;
        index += 1;
      }
      continue;
    }
    if (quote !== null) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "/" && next === "*") {
      comment = true;
      index += 1;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (["(", "["].includes(character)) stack.push(character);
    else if ([")", "]"].includes(character)) stack.pop();
    else if (character === "," && stack.length === 0) {
      selectors.push(value.slice(start, index).replace(/\/\*[\s\S]*?\*\//gu, "").trim());
      start = index + 1;
    }
  }
  selectors.push(value.slice(start).replace(/\/\*[\s\S]*?\*\//gu, "").trim());
  return selectors.filter(Boolean);
}

function selectorKinds(selector) {
  const stripped = selector.replace(/\\./gu, "").replace(/\[[^\]]*\]/gu, "[]");
  const kinds = new Set();
  if (selector.includes("[")) kinds.add("attribute");
  if (/(?:^|[^\\])\.[-_A-Za-z]/u.test(stripped)) kinds.add("class");
  if (/(?:^|[^\\])#[-_A-Za-z]/u.test(stripped)) kinds.add("id");
  if (/(?:^|[^:])::[-_A-Za-z]/u.test(stripped)) kinds.add("pseudo-element");
  if (/(?:^|[^:]):(?!:)[-_A-Za-z]/u.test(stripped)) kinds.add("pseudo");
  if (/(?:^|[>+~\s,(])[-_A-Za-z][-_A-Za-z0-9]*(?=$|[.#[:>+~\s,)])/u.test(stripped)) kinds.add("type");
  if (/(?:^|[>+~\s,(])\*/u.test(stripped)) kinds.add("universal");
  return [...kinds].sort();
}

function symbolKey(qualifiedName, declarationOrdinal) {
  return `${qualifiedName}@${declarationOrdinal}`;
}

export function strictCssTruth(filePath, source) {
  if (source.length > MAX_SOURCE_LENGTH) return null;
  let root;
  try {
    root = postcss.parse(source, { from: filePath });
  } catch {
    return null;
  }
  let nodeCount = 0;
  let resourceCount = 0;
  const resources = [];
  const containments = [];
  const resourceOrdinals = new Map();
  const structuralOrdinals = new Map();
  const file = { key: symbolKey(filePath, 0), qualifiedName: filePath };

  const addResource = (parent, name, category) => {
    if (name.length > MAX_SELECTOR || resourceCount >= MAX_RESOURCES) return null;
    const identity = `${parent.key}\0${category}\0${name}`;
    const ordinal = resourceOrdinals.get(identity) ?? 0;
    resourceOrdinals.set(identity, ordinal + 1);
    const qualifiedName = `${parent.qualifiedName}#css-${category}:${name}`;
    const resource = { key: symbolKey(qualifiedName, ordinal), qualifiedName };
    resources.push(resource.key);
    containments.push(`${parent.key}->${resource.key}`);
    resourceCount += 1;
    return resource;
  };
  const structuralName = (parent, category) => {
    const key = `${parent.key}\0${category}`;
    const ordinal = (structuralOrdinals.get(key) ?? 0) + 1;
    structuralOrdinals.set(key, ordinal);
    return `${category}[${ordinal}]`;
  };
  const addDeclarations = (container, owner) => {
    const groups = new Set();
    for (const declaration of container.nodes?.filter((node) => node.type === "decl") ?? []) {
      if (declaration.prop.length > MAX_PROPERTY_NAME || declaration.toString().length > MAX_PROPERTY_VALUE) return false;
      if (declaration.prop.startsWith("--")) addResource(owner, declaration.prop, "custom-property");
      const group = declarationGroup(declaration.prop);
      if (group !== null && group !== "custom-property") groups.add(group);
    }
    for (const group of groups) addResource(owner, `declaration-group:${group}`, "semantic");
    return true;
  };

  const visit = (container, parent, depth, inKeyframes = false) => {
    if (depth > MAX_DEPTH) return false;
    for (const node of container.nodes ?? []) {
      nodeCount += 1;
      if (nodeCount > MAX_NODES) return false;
      if (node.type === "comment" || node.type === "decl") continue;
      if (node.type === "rule") {
        if (node.selector.length > MAX_SELECTOR) return false;
        if (inKeyframes) {
          const keyframe = addResource(parent, normalizedSpace(node.selector), structuralName(parent, "keyframe"));
          if (keyframe === null || !addDeclarations(node, keyframe)) return false;
          continue;
        }
        const rule = addResource(parent, node.selector.trim(), structuralName(parent, "rule"));
        if (rule === null) return false;
        for (const selectorName of splitSelectors(node.selector)) {
          const selector = addResource(rule, selectorName, "selector");
          if (selector === null) return false;
          for (const kind of selectorKinds(selectorName)) addResource(selector, `selector-kind:${kind}`, "semantic");
        }
        if (!addDeclarations(node, rule) || !visit(node, rule, depth + 1, false)) return false;
        continue;
      }
      if (node.type === "atrule") {
        const name = normalizedSpace(`@${node.name}${node.params.length === 0 ? "" : ` ${node.params}`}`);
        const atRule = addResource(parent, name, structuralName(parent, "at-rule"));
        if (atRule === null) return false;
        if (node.nodes !== undefined && !visit(node, atRule, depth + 1, node.name.toLowerCase().endsWith("keyframes"))) return false;
        continue;
      }
      return false;
    }
    return resourceCount <= MAX_RESOURCES;
  };

  return visit(root, file, 0) && resources.length > 0 ? { resources, containments } : null;
}

function sourceFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory() && ![".git", "dist"].includes(entry.name)) visit(absolute);
      else if (entry.isFile() && extname(entry.name).toLowerCase() === ".css") files.push(absolute);
    }
  };
  visit(root);
  return files.sort((left, right) => left.localeCompare(right));
}

export function scoreSets(expected, actual) {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  const tp = [...expectedSet].filter((item) => actualSet.has(item));
  const fn = [...expectedSet].filter((item) => !actualSet.has(item));
  const fp = [...actualSet].filter((item) => !expectedSet.has(item));
  return { tp: tp.length, fp: fp.length, fn: fn.length, firstFalsePositives: fp.slice(0, 25), firstFalseNegatives: fn.slice(0, 25) };
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1] ?? null;
}

export async function runOracle({ sourceRoot, projectRoot, sourceCommit }) {
  const [{ SYMBOL_LATTICE_VERSION }, { SqliteGraphStore }] = await Promise.all([
    import("../dist/version.js"),
    import("../dist/infrastructure/sqlite/graph-store.js")
  ]);
  const source = resolve(sourceRoot);
  const project = resolve(projectRoot);
  const store = new SqliteGraphStore({ readOnly: true });
  const bundle = store.getActiveGraphBundle(project);
  if (!bundle.status.initialized || bundle.status.stale) throw new Error("Product project must have a fresh index.");
  const files = sourceFiles(source);
  const selected = [];
  const manifest = createHash("sha256");
  for (const absolute of files) {
    const filePath = relative(source, absolute).replaceAll("\\", "/");
    const contents = readFileSync(absolute, "utf8");
    manifest.update(filePath).update("\0").update(sha256(contents)).update("\n");
    const truth = strictCssTruth(filePath, contents);
    if (truth !== null) selected.push({ filePath, ...truth });
  }
  const selectedPaths = new Set(selected.map(({ filePath }) => filePath));
  const symbolsById = new Map(bundle.snapshot.symbols.map((symbol) => [symbol.id, symbol]));
  const expectedResources = selected.flatMap(({ resources }) => resources);
  const expectedContainments = selected.flatMap(({ containments }) => containments);
  const actualResources = bundle.snapshot.symbols
    .filter((symbol) => selectedPaths.has(symbol.filePath) && symbol.kind === "resource")
    .map((symbol) => symbolKey(symbol.qualifiedName, symbol.declarationOrdinal));
  const actualContainments = bundle.snapshot.edges
    .filter((edge) => selectedPaths.has(edge.filePath) && edge.kind === "contains" && edge.targetId !== null)
    .map((edge) => {
      const sourceSymbol = symbolsById.get(edge.sourceId);
      const targetSymbol = symbolsById.get(edge.targetId);
      return `${symbolKey(sourceSymbol?.qualifiedName ?? edge.sourceId, sourceSymbol?.declarationOrdinal ?? 0)}->${symbolKey(targetSymbol?.qualifiedName ?? edge.targetId, targetSymbol?.declarationOrdinal ?? 0)}`;
    });
  const resourceScore = scoreSets(expectedResources, actualResources);
  const containmentScore = scoreSets(expectedContainments, actualContainments);
  const score = { tp: resourceScore.tp + containmentScore.tp, fp: resourceScore.fp + containmentScore.fp, fn: resourceScore.fn + containmentScore.fn };
  const quota = { minimumSelectedFiles: 20, minimumResources: 1_000, minimumContainments: 1_000 };
  const quotaMet = selected.length >= quota.minimumSelectedFiles && expectedResources.length >= quota.minimumResources && expectedContainments.length >= quota.minimumContainments;
  return {
    schemaVersion: 1,
    benchmark: "symbollattice-css-large-project-correctness-v1",
    productVersion: SYMBOL_LATTICE_VERSION,
    extractorVersion: bundle.extractorVersion,
    source: { root: source, commit: sourceCommit, cssFiles: files.length, contentManifestSha256: manifest.digest("hex").toUpperCase() },
    selection: { strictSubsetFiles: selected.length, excludedFiles: files.length - selected.length, selectedPathsSha256: sha256(selected.map(({ filePath }) => filePath).join("\n")), examples: selected.slice(0, 20).map(({ filePath }) => filePath) },
    quota,
    scores: { resources: resourceScore, containment: containmentScore, combined: score },
    acceptance: { quotaMet, status: quotaMet && score.fp === 0 && score.fn === 0 ? "pass" : "fail" }
  };
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sourceRoot = argument("--source");
  const projectRoot = argument("--project");
  const output = argument("--output");
  const sourceCommit = argument("--commit");
  const lifecyclePath = argument("--lifecycle");
  if ([sourceRoot, projectRoot, output, sourceCommit].some((value) => value === null)) throw new Error("Usage: --source <fixed checkout> --project <indexed copy> --commit <40-char sha> --output <json>");
  const correctness = await runOracle({ sourceRoot, projectRoot, sourceCommit });
  const lifecycle = lifecyclePath === null ? null : JSON.parse(readFileSync(resolve(lifecyclePath), "utf8"));
  const lifecyclePassed = lifecycle === null || lifecycle.acceptance?.status === "pass";
  const report = {
    ...correctness,
    ...(lifecycle === null ? {} : { lifecycle }),
    acceptance: {
      ...correctness.acceptance,
      lifecyclePassed,
      status: correctness.acceptance.status === "pass" && lifecyclePassed ? "pass" : "fail"
    }
  };
  writeFileSync(resolve(output), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report));
  if (report.acceptance.status !== "pass") process.exitCode = 1;
}
