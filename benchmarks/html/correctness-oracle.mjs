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
const ATTRIBUTE_NAME = /^[A-Za-z_:][A-Za-z0-9_.:-]*/u;
const STATIC_ATTRIBUTES = new Set([
  "alt", "autofocus", "checked", "class", "disabled", "formnovalidate", "hidden", "id",
  "lang", "multiple", "name", "novalidate", "open", "placeholder", "readonly", "required",
  "role", "scope", "selected", "title", "type", "value"
]);
const BOOLEAN_ATTRIBUTES = new Set([
  "autofocus", "checked", "disabled", "formnovalidate", "hidden", "multiple", "novalidate",
  "open", "readonly", "required", "selected"
]);
const INTERACTIVE_CONTROLS = new Set(["button", "input", "select", "textarea"]);
const MAX_ATTRIBUTES = 256;
const MAX_ATTRIBUTE_NAME = 256;
const MAX_ATTRIBUTE_VALUE = 4096;

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

function strictAttributes(tagSource, tagName) {
  let text = tagSource.slice(1 + tagName.length, -1).trim();
  if (text.endsWith("/")) text = text.slice(0, -1).trimEnd();
  const attributes = [];
  let offset = 0;
  while (offset < text.length) {
    while (/\s/u.test(text[offset] ?? "")) offset += 1;
    if (offset >= text.length) break;
    const nameMatch = ATTRIBUTE_NAME.exec(text.slice(offset));
    if (nameMatch === null) return null;
    const name = nameMatch[0].toLowerCase();
    offset += nameMatch[0].length;
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
        const match = /^[^\s"'`=<>]+/u.exec(text.slice(offset));
        if (match === null) return null;
        value = match[0];
        offset += match[0].length;
      }
    }
    attributes.push({ name, value });
  }
  return attributes.length <= MAX_ATTRIBUTES && attributes.every((attribute) =>
    attribute.name.length <= MAX_ATTRIBUTE_NAME && (attribute.value?.length ?? 0) <= MAX_ATTRIBUTE_VALUE
  ) ? attributes : null;
}

function isStatic(attribute) {
  return attribute.value === null || !/(?:\{\{|\}\}|\{%|%\}|<%|%>|\$\{)/u.test(attribute.value);
}

function isInteractiveControl(node) {
  if (!INTERACTIVE_CONTROLS.has(node.name)) return false;
  if (node.attributes.some((attribute) => attribute.name === "disabled" || attribute.name === "hidden")) return false;
  if (node.name !== "input") return true;
  const type = node.attributes.find((attribute) => attribute.name === "type");
  if (type === undefined) return true;
  return isStatic(type) && type.value !== null && type.value.toLowerCase() !== "hidden";
}

function isExposed(name) {
  return STATIC_ATTRIBUTES.has(name) || name.startsWith("aria-") || name.startsWith("data-");
}

function semantic(name, parentName) {
  if (/^h[1-6]$/u.test(name)) return `heading:${name}`;
  if (["header", "footer"].includes(name)) return parentName === "body" ? `landmark:${name}` : `section:${name}`;
  if (["nav", "main", "aside"].includes(name)) return `landmark:${name}`;
  if (name === "form") return "form:form";
  if (["input", "select", "textarea", "button", "output"].includes(name)) return `form-control:${name}`;
  if (["table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption"].includes(name)) return `table:${name}`;
  if (["ul", "ol", "li", "dl", "dt", "dd"].includes(name)) return `list:${name}`;
  return null;
}

/** Independent strict-subset scanner: explicit nesting only, no browser recovery. */
export function strictHtmlTruth(filePath, source) {
  const root = { name: filePath, qualifiedName: filePath, counts: new Map(), children: [] };
  const stack = [root];
  const resources = [];
  const containments = [];
  const nodes = [];
  const addResource = (node, type, name) => {
    const qualifiedName = `${node.qualifiedName}#html-${type}:${name}`;
    resources.push(qualifiedName);
    containments.push(`${node.qualifiedName}->${qualifiedName}`);
  };
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
    const attributes = strictAttributes(source.slice(opening, end), match[1]);
    if (attributes === null) return null;
    const parent = stack.at(-1);
    if (parent === undefined) return null;
    const ordinal = (parent.counts.get(name) ?? 0) + 1;
    parent.counts.set(name, ordinal);
    const parentPath = parent.path ?? "";
    const path = parentPath.length === 0 ? `${name}[${ordinal}]` : `${parentPath}/${name}[${ordinal}]`;
    const qualifiedName = `${filePath}#html-element:${path}`;
    resources.push(qualifiedName);
    containments.push(`${parent.qualifiedName}->${qualifiedName}`);
    const node = { name, path, qualifiedName, counts: new Map(), attributes, children: [] };
    parent.children.push(node);
    nodes.push(node);
    for (const attribute of attributes) {
      if (isExposed(attribute.name) && isStatic(attribute)) {
        addResource(node, "attribute", attribute.value === null ? attribute.name : `${attribute.name}=${attribute.value}`);
      }
    }
    const classification = semantic(name, parent.name);
    if (classification !== null) addResource(node, "semantic", classification);
    const beforeClose = source.slice(opening, end - 1).trimEnd();
    const selfClosing = beforeClose.endsWith("/");
    if (selfClosing && !VOID_ELEMENTS.has(name)) return null;
    if (!VOID_ELEMENTS.has(name)) {
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
  if (stack.length !== 1) return null;

  const htmlNode = nodes.find((node) => node.name === "html");
  const htmlLang = htmlNode?.attributes.find((attribute) => attribute.name === "lang");
  if (htmlNode !== undefined && (htmlLang === undefined || (isStatic(htmlLang) && (htmlLang.value ?? "").trim() === ""))) {
    addResource(htmlNode, "diagnostic", "diagnostic:html-missing-lang");
  }
  const ids = new Map();
  const descendants = (node, expected) => node.children.some((child) => child.name === expected || descendants(child, expected));
  for (const node of nodes) {
    const seen = new Set();
    for (const attribute of node.attributes) {
      if (seen.has(attribute.name)) addResource(node, "diagnostic", `diagnostic:duplicate-attribute:${attribute.name}`);
      seen.add(attribute.name);
      if (BOOLEAN_ATTRIBUTES.has(attribute.name) && isStatic(attribute) && attribute.value !== null && attribute.value !== "" && attribute.value.toLowerCase() !== attribute.name) {
        addResource(node, "diagnostic", `diagnostic:boolean-attribute-invalid-value:${attribute.name}`);
      }
      if (attribute.name === "id" && isStatic(attribute) && attribute.value !== null && attribute.value.trim() !== "") {
        const entries = ids.get(attribute.value) ?? [];
        entries.push(node);
        ids.set(attribute.value, entries);
      }
    }
    const role = node.attributes.find((attribute) => attribute.name === "role");
    if (isInteractiveControl(node) && role !== undefined && isStatic(role) && role.value !== null && ["none", "presentation"].includes(role.value.toLowerCase())) {
      addResource(node, "diagnostic", "diagnostic:presentational-role-on-form-control");
    }
    const hidden = node.attributes.find((attribute) => attribute.name === "aria-hidden");
    if (isInteractiveControl(node) && hidden !== undefined && isStatic(hidden) && hidden.value?.toLowerCase() === "true") {
      addResource(node, "diagnostic", "diagnostic:aria-hidden-interactive-control");
    }
    if (node.name === "img" && !node.attributes.some((attribute) => attribute.name === "alt")) {
      addResource(node, "diagnostic", "diagnostic:image-missing-alt");
    }
    if (node.name === "ul" || node.name === "ol") {
      const invalid = node.children.find((child) => !["li", "script", "template"].includes(child.name));
      if (invalid !== undefined) addResource(node, "diagnostic", `diagnostic:list-invalid-direct-child:${invalid.name}`);
    }
    if (node.name === "table" && !descendants(node, "tr")) {
      addResource(node, "diagnostic", "diagnostic:table-missing-row");
    }
  }
  for (const [id, entries] of ids) {
    for (const node of entries.slice(1)) addResource(node, "diagnostic", `diagnostic:duplicate-id:${id}`);
  }
  let prior = null;
  for (const node of nodes) {
    if (!/^h[1-6]$/u.test(node.name)) continue;
    const level = Number(node.name.slice(1));
    if (prior !== null && level > prior + 1) addResource(node, "diagnostic", `diagnostic:heading-level-skip:h${prior}-to-h${level}`);
    prior = level;
  }
  return { resources, containments };
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
    import("../../dist/version.js"),
    import("../../dist/infrastructure/sqlite/graph-store.js")
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
    if (truth !== null && truth.resources.length > 0 && truth.resources.length <= 300) {
      selected.push({ filePath, ...truth });
    }
  }
  const selectedPaths = new Set(selected.map(({ filePath }) => filePath));
  const symbolsById = new Map(bundle.snapshot.symbols.map((symbol) => [symbol.id, symbol]));
  const expectedResources = selected.flatMap(({ resources }) => resources);
  const expectedContainments = selected.flatMap(({ containments }) => containments);
  const actualResources = bundle.snapshot.symbols
    .filter((symbol) => selectedPaths.has(symbol.filePath) && symbol.kind === "resource")
    .map((symbol) => symbol.qualifiedName);
  const actualContainments = bundle.snapshot.edges
    .filter((edge) => selectedPaths.has(edge.filePath) && edge.kind === "contains" && edge.targetId !== null)
    .map((edge) => {
      const sourceSymbol = symbolsById.get(edge.sourceId);
      const targetSymbol = symbolsById.get(edge.targetId);
      return `${sourceSymbol?.qualifiedName ?? edge.sourceId}->${targetSymbol?.qualifiedName ?? edge.targetId}`;
    });
  const resourceScore = scoreSets(expectedResources, actualResources);
  const containmentScore = scoreSets(expectedContainments, actualContainments);
  const score = {
    tp: resourceScore.tp + containmentScore.tp,
    fp: resourceScore.fp + containmentScore.fp,
    fn: resourceScore.fn + containmentScore.fn
  };
  const quota = { minimumSelectedFiles: 20, minimumResources: 1_000, minimumContainments: 1_000 };
  const quotaMet = selected.length >= quota.minimumSelectedFiles && expectedResources.length >= quota.minimumResources && expectedContainments.length >= quota.minimumContainments;
  return {
    schemaVersion: 1,
    benchmark: "symbollattice-html-large-project-correctness-v2",
    productVersion: SYMBOL_LATTICE_VERSION,
    extractorVersion: bundle.extractorVersion,
    source: { root: source, commit: sourceCommit, htmlFiles: files.length, contentManifestSha256: manifest.digest("hex").toUpperCase() },
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
  if ([sourceRoot, projectRoot, output, sourceCommit].some((value) => value === null)) {
    throw new Error("Usage: --source <fixed checkout> --project <indexed copy> --commit <40-char sha> --output <json>");
  }
  const report = await runOracle({ sourceRoot, projectRoot, sourceCommit });
  writeFileSync(resolve(output), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report));
  if (report.acceptance.status !== "pass") process.exitCode = 1;
}
