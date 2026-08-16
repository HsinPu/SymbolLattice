import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const JSP_EXTENSIONS = new Set([".jsp", ".jspf", ".jspx", ".tag", ".tagx"]);
const NAME = /^[A-Za-z_][A-Za-z0-9_.:-]*/u;
const ATTRIBUTE_NAME = /^[A-Za-z_:][A-Za-z0-9_.:-]*/u;
const VOID_ELEMENTS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex").toUpperCase();
}

function closingOutsideQuotes(source, start, delimiter) {
  let quote = null;
  let escaped = false;
  for (let offset = start; offset < source.length; offset += 1) {
    const character = source[offset];
    if (quote !== null) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
    } else if (character === '"' || character === "'") quote = character;
    else if (source.startsWith(delimiter, offset)) return offset;
  }
  return null;
}

function strictAttributes(text) {
  const attributes = [];
  const names = new Set();
  let offset = 0;
  while (offset < text.length) {
    while (/\s/u.test(text[offset] ?? "")) offset += 1;
    if (offset === text.length) return attributes;
    const match = ATTRIBUTE_NAME.exec(text.slice(offset));
    if (match === null || match.index !== 0 || names.has(match[0])) return null;
    const name = match[0];
    names.add(name);
    offset += name.length;
    while (/\s/u.test(text[offset] ?? "")) offset += 1;
    let value = null;
    if (text[offset] === "=") {
      offset += 1;
      while (/\s/u.test(text[offset] ?? "")) offset += 1;
      const quote = text[offset];
      if (quote === '"' || quote === "'") {
        const end = text.indexOf(quote, offset + 1);
        if (end < 0) return null;
        value = text.slice(offset + 1, end);
        offset = end + 1;
      } else {
        const valueMatch = /^[^\s<>"'\x60=]+/u.exec(text.slice(offset));
        if (valueMatch === null) return null;
        value = valueMatch[0];
        offset += value.length;
      }
    }
    attributes.push({ name, value });
  }
  return attributes;
}

function strictOpeningTag(source, start, end) {
  let body = source.slice(start + 1, end);
  const selfClosing = /\/\s*$/u.test(body);
  if (selfClosing) body = body.replace(/\/\s*$/u, "");
  const nameMatch = NAME.exec(body);
  if (nameMatch === null || nameMatch.index !== 0) return null;
  const attributes = strictAttributes(body.slice(nameMatch[0].length));
  return attributes === null ? null : { name: nameMatch[0], selfClosing };
}

/** Independent strict-subset oracle for classic directive identities and containment. */
export function strictJspDirectiveTruth(filePath, source) {
  const xmlSyntax = /\.(?:jspx|tagx)$/iu.test(filePath);
  const stack = [];
  const directives = [];
  const directiveCounts = new Map();
  let offset = 0;
  while (offset < source.length) {
    const opening = source.indexOf("<", offset);
    if (opening < 0) break;
    if (source.startsWith("<%--", opening)) {
      const end = source.indexOf("--%>", opening + 4);
      if (end < 0) return null;
      offset = end + 4;
      continue;
    }
    if (source.startsWith("<%@", opening)) {
      const end = closingOutsideQuotes(source, opening + 3, "%>");
      if (end === null) return null;
      const body = source.slice(opening + 3, end);
      const kindMatch = /^\s*([A-Za-z_][A-Za-z0-9_.:-]*)/u.exec(body);
      if (kindMatch === null || kindMatch[1] === undefined) return null;
      const kind = kindMatch[1];
      const attributes = strictAttributes(body.slice(kindMatch[0].length));
      if (attributes === null) return null;
      const prefix = attributes.find((attribute) => attribute.name === "prefix")?.value ?? "";
      const ordinal = directiveCounts.get(kind) ?? 0;
      directiveCounts.set(kind, ordinal + 1);
      directives.push({ kind, prefix, ordinal, attributes });
      offset = end + 2;
      continue;
    }
    if (source.startsWith("<%", opening)) {
      const end = source.indexOf("%>", opening + 2);
      if (end < 0) return null;
      offset = end + 2;
      continue;
    }
    if (source.startsWith("<!--", opening)) {
      const end = source.indexOf("-->", opening + 4);
      if (end < 0) return null;
      offset = end + 3;
      continue;
    }
    if (source.startsWith("<?", opening)) {
      const end = closingOutsideQuotes(source, opening + 2, "?>");
      if (end === null) return null;
      offset = end + 2;
      continue;
    }
    if (/^<!doctype\b/iu.test(source.slice(opening, opening + 16))) {
      const end = closingOutsideQuotes(source, opening + 2, ">");
      if (end === null) return null;
      offset = end + 1;
      continue;
    }
    if (source.startsWith("</", opening)) {
      const end = closingOutsideQuotes(source, opening + 2, ">");
      if (end === null) return null;
      const name = source.slice(opening + 2, end).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_.:-]*$/u.test(name)) return null;
      const expected = stack.pop();
      const comparable = xmlSyntax ? name : name.toLowerCase();
      if (expected === undefined || expected !== comparable) return null;
      offset = end + 1;
      continue;
    }
    if (source.startsWith("<!", opening)) return null;
    const end = closingOutsideQuotes(source, opening + 1, ">");
    if (end === null) return null;
    const tag = strictOpeningTag(source, opening, end);
    if (tag === null) return null;
    const comparable = xmlSyntax ? tag.name : tag.name.toLowerCase();
    if (!tag.selfClosing && (xmlSyntax || !VOID_ELEMENTS.has(comparable))) stack.push(comparable);
    offset = end + 1;
  }
  if (stack.length !== 0 || directives.length === 0) return null;

  const prefixCounts = new Map();
  for (const directive of directives) {
    if (directive.kind === "taglib" && directive.prefix !== "") {
      prefixCounts.set(directive.prefix, (prefixCounts.get(directive.prefix) ?? 0) + 1);
    }
  }
  const resources = [];
  const containments = [];
  for (const directive of directives) {
    const qualifiedName = filePath + "#jsp-directive:" + directive.kind + ":" + directive.prefix + ":" + directive.ordinal;
    resources.push(qualifiedName);
    containments.push(filePath + "->" + qualifiedName);
    for (const attribute of directive.attributes) {
      const attributeName = qualifiedName + "#jsp-attribute:" + attribute.name;
      resources.push(attributeName);
      containments.push(qualifiedName + "->" + attributeName);
    }
    const uri = directive.attributes.find((attribute) => attribute.name === "uri")?.value;
    const tagDir = directive.attributes.find((attribute) => attribute.name === "tagdir")?.value;
    const binding = tagDir ?? uri;
    if (
      directive.kind === "taglib" &&
      directive.prefix !== "" &&
      prefixCounts.get(directive.prefix) === 1 &&
      binding !== undefined &&
      binding !== null &&
      !/(?:<%|%>|\$\{|#\{)/u.test(binding)
    ) {
      const bindingName = qualifiedName + "#jsp-taglib:" + directive.prefix;
      resources.push(bindingName);
      containments.push(qualifiedName + "->" + bindingName);
    }
  }
  return { resources, containments };
}

export function scoreSets(expected, actual) {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  const tp = [...expectedSet].filter((item) => actualSet.has(item));
  const fn = [...expectedSet].filter((item) => !actualSet.has(item));
  const fp = [...actualSet].filter((item) => !expectedSet.has(item));
  return { tp: tp.length, fp: fp.length, fn: fn.length, firstFalsePositives: fp.slice(0, 25), firstFalseNegatives: fn.slice(0, 25) };
}

function sourceFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (JSP_EXTENSIONS.has(extname(entry.name).toLowerCase())) files.push(absolute);
    }
  };
  visit(root);
  return files.sort((left, right) => left.localeCompare(right));
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
    const truth = /(?:\$|#)\{/u.test(contents)
      ? null
      : strictJspDirectiveTruth(filePath, contents);
    if (truth !== null) selected.push({ filePath, ...truth });
  }
  const selectedPaths = new Set(selected.map(({ filePath }) => filePath));
  const symbolsById = new Map(bundle.snapshot.symbols.map((symbol) => [symbol.id, symbol]));
  const expectedResources = selected.flatMap(({ resources }) => resources);
  const expectedContainments = selected.flatMap(({ containments }) => containments);
  const actualResources = bundle.snapshot.symbols
    .filter((symbol) => selectedPaths.has(symbol.filePath) && symbol.kind === "resource" && symbol.qualifiedName.startsWith(symbol.filePath + "#jsp-directive:"))
    .map((symbol) => symbol.qualifiedName);
  const actualSurface = new Set(actualResources);
  const actualContainments = bundle.snapshot.edges
    .filter((edge) => selectedPaths.has(edge.filePath) && edge.kind === "contains" && edge.targetId !== null && actualSurface.has(symbolsById.get(edge.targetId)?.qualifiedName ?? ""))
    .map((edge) => {
      const sourceSymbol = symbolsById.get(edge.sourceId);
      const targetSymbol = symbolsById.get(edge.targetId);
      return (sourceSymbol?.qualifiedName ?? edge.sourceId) + "->" + (targetSymbol?.qualifiedName ?? edge.targetId);
    });
  const resourceScore = scoreSets(expectedResources, actualResources);
  const containmentScore = scoreSets(expectedContainments, actualContainments);
  const score = { tp: resourceScore.tp + containmentScore.tp, fp: resourceScore.fp + containmentScore.fp, fn: resourceScore.fn + containmentScore.fn };
  const quota = { minimumSelectedFiles: 20, minimumResources: 300, minimumContainments: 300 };
  const quotaMet = selected.length >= quota.minimumSelectedFiles && expectedResources.length >= quota.minimumResources && expectedContainments.length >= quota.minimumContainments;
  return {
    schemaVersion: 1,
    benchmark: "symbollattice-jsp-large-project-correctness-v1",
    productVersion: SYMBOL_LATTICE_VERSION,
    extractorVersion: bundle.extractorVersion,
    source: { root: source, commit: sourceCommit, jspFiles: files.length, contentManifestSha256: manifest.digest("hex").toUpperCase() },
    selection: { strictSubsetFiles: selected.length, excludedFiles: files.length - selected.length, selectedPathsSha256: sha256(selected.map(({ filePath }) => filePath).join("\n")), examples: selected.slice(0, 20).map(({ filePath }) => filePath) },
    quota,
    scores: { resources: resourceScore, containment: containmentScore, combined: score },
    acceptance: { quotaMet, status: quotaMet && score.fp === 0 && score.fn === 0 ? "pass" : "fail" }
  };
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1] ?? null;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sourceRoot = argument("--source");
  const projectRoot = argument("--project");
  const output = argument("--output");
  const sourceCommit = argument("--commit");
  if ([sourceRoot, projectRoot, output, sourceCommit].some((value) => value === null)) throw new Error("Usage: --source <fixed checkout> --project <indexed copy> --commit <40-char sha> --output <json>");
  const report = await runOracle({ sourceRoot, projectRoot, sourceCommit });
  writeFileSync(resolve(output), JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(JSON.stringify(report));
  if (report.acceptance.status !== "pass") process.exitCode = 1;
}
