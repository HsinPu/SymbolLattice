import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
  "param", "source", "track", "wbr"
]);
const RAW_ELEMENTS = new Set(["script", "style", "textarea", "title"]);
const TAG_NAME = /^[A-Za-z][A-Za-z0-9:-]*/u;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex").toUpperCase();
}

function tagEnd(source, start) {
  let quote = null;
  for (let offset = start; offset < source.length; offset += 1) {
    const character = source[offset];
    if (quote !== null) {
      if (character === quote) quote = null;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return offset + 1;
    }
  }
  return null;
}

function closingTag(source, name, start) {
  const pattern = new RegExp(`</${name}\\s*>`, "giu");
  pattern.lastIndex = start;
  const match = pattern.exec(source);
  return match === null ? null : { start: match.index, end: match.index + match[0].length };
}

/** Independent strict-subset scanner: explicit nesting only, no browser recovery. */
export function strictHtmlTruth(filePath, source) {
  const root = { qualifiedName: filePath, counts: new Map() };
  const stack = [root];
  const identities = [];
  const containments = [];
  let offset = 0;
  while (offset < source.length) {
    const opening = source.indexOf("<", offset);
    if (opening < 0) break;
    if (source.startsWith("<!--", opening)) {
      const end = source.indexOf("-->", opening + 4);
      if (end < 0) return null;
      offset = end + 3;
      continue;
    }
    if (/^<!doctype\b/iu.test(source.slice(opening))) {
      const end = tagEnd(source, opening + 2);
      if (end === null) return null;
      offset = end;
      continue;
    }
    if (source.startsWith("</", opening)) {
      const match = /^<\/([A-Za-z][A-Za-z0-9:-]*)\s*>/u.exec(source.slice(opening));
      if (match === null || match[1] === undefined || stack.length === 1) return null;
      const name = match[1].toLowerCase();
      const current = stack.at(-1);
      if (current?.name !== name) return null;
      stack.pop();
      offset = opening + match[0].length;
      continue;
    }
    const match = /^<([A-Za-z][A-Za-z0-9:-]*)\b/u.exec(source.slice(opening));
    if (match === null || match[1] === undefined) {
      offset = opening + 1;
      continue;
    }
    const end = tagEnd(source, opening + match[0].length);
    if (end === null) return null;
    const name = match[1].toLowerCase();
    const parent = stack.at(-1);
    if (parent === undefined) return null;
    const ordinal = (parent.counts.get(name) ?? 0) + 1;
    parent.counts.set(name, ordinal);
    const parentPath = parent.path ?? "";
    const path = parentPath.length === 0 ? `${name}[${ordinal}]` : `${parentPath}/${name}[${ordinal}]`;
    const qualifiedName = `${filePath}#html-element:${path}`;
    identities.push(qualifiedName);
    containments.push(`${parent.qualifiedName}->${qualifiedName}`);
    const beforeClose = source.slice(opening, end - 1).trimEnd();
    const selfClosing = beforeClose.endsWith("/");
    if (selfClosing && !VOID_ELEMENTS.has(name)) return null;
    if (!VOID_ELEMENTS.has(name)) {
      const node = { name, path, qualifiedName, counts: new Map() };
      stack.push(node);
      if (RAW_ELEMENTS.has(name)) {
        const close = closingTag(source, name, end);
        if (close === null) return null;
        stack.pop();
        offset = close.end;
        continue;
      }
    }
    offset = end;
  }
  return stack.length === 1 ? { identities, containments } : null;
}

function sourceFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if ([".html", ".htm"].includes(extname(entry.name).toLowerCase())) files.push(absolute);
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
    const truth = strictHtmlTruth(filePath, contents);
    if (truth !== null && truth.identities.length > 0 && truth.identities.length <= 100) {
      selected.push({ filePath, ...truth });
    }
  }
  const selectedPaths = new Set(selected.map(({ filePath }) => filePath));
  const symbolsById = new Map(bundle.snapshot.symbols.map((symbol) => [symbol.id, symbol]));
  const expectedIdentities = selected.flatMap(({ identities }) => identities);
  const expectedContainments = selected.flatMap(({ containments }) => containments);
  const actualIdentities = bundle.snapshot.symbols
    .filter((symbol) => selectedPaths.has(symbol.filePath) && symbol.kind === "resource")
    .map((symbol) => symbol.qualifiedName);
  const actualContainments = bundle.snapshot.edges
    .filter((edge) => selectedPaths.has(edge.filePath) && edge.kind === "contains" && edge.targetId !== null)
    .map((edge) => {
      const sourceSymbol = symbolsById.get(edge.sourceId);
      const targetSymbol = symbolsById.get(edge.targetId);
      return `${sourceSymbol?.qualifiedName ?? edge.sourceId}->${targetSymbol?.qualifiedName ?? edge.targetId}`;
    });
  const identityScore = scoreSets(expectedIdentities, actualIdentities);
  const containmentScore = scoreSets(expectedContainments, actualContainments);
  const score = {
    tp: identityScore.tp + containmentScore.tp,
    fp: identityScore.fp + containmentScore.fp,
    fn: identityScore.fn + containmentScore.fn
  };
  const quota = { minimumSelectedFiles: 20, minimumIdentities: 300, minimumContainments: 300 };
  const quotaMet = selected.length >= quota.minimumSelectedFiles && expectedIdentities.length >= quota.minimumIdentities && expectedContainments.length >= quota.minimumContainments;
  return {
    schemaVersion: 1,
    benchmark: "symbollattice-html-large-project-correctness-v1",
    productVersion: SYMBOL_LATTICE_VERSION,
    extractorVersion: bundle.extractorVersion,
    source: { root: source, commit: sourceCommit, htmlFiles: files.length, contentManifestSha256: manifest.digest("hex").toUpperCase() },
    selection: { strictSubsetFiles: selected.length, excludedFiles: files.length - selected.length, selectedPathsSha256: sha256(selected.map(({ filePath }) => filePath).join("\n")), examples: selected.slice(0, 20).map(({ filePath }) => filePath) },
    quota,
    scores: { identities: identityScore, containment: containmentScore, combined: score },
    acceptance: { quotaMet, status: quotaMet && score.fp === 0 && score.fn === 0 ? "pass" : "fail" }
  };
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sourceRoot = argument("--source");
  const projectRoot = argument("--project");
  const output = argument("--output");
  const sourceCommit = argument("--commit");
  if ([sourceRoot, projectRoot, output, sourceCommit].some((value) => value === null)) {
    throw new Error("Usage: --source <fixed checkout> --project <indexed copy> --commit <40-char sha> --output <json>");
  }
  const report = await runOracle({ sourceRoot, projectRoot, sourceCommit });
  writeFileSync(resolve(output), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report));
  if (report.acceptance.status !== "pass") process.exitCode = 1;
}
