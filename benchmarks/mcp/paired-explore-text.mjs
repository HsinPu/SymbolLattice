import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

function option(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1] ?? null;
}

function isWithin(path, directory) {
  const remainder = relative(directory, path);
  return remainder === "" || (!isAbsolute(remainder) && remainder !== ".." &&
    !remainder.startsWith("../") && !remainder.startsWith("..\\"));
}

const reports = option("--reports");
const baselineRoot = option("--baseline-root");
const candidateRoot = option("--candidate-root");
const output = option("--output");
if ([reports, baselineRoot, candidateRoot, output].some((value) => value === null)) {
  throw new Error("Usage: --reports <task-retrieval-report-directory> --baseline-root <built-product> --candidate-root <built-product> --output <external-report.json>");
}
const reportDirectory = resolve(reports);
const roots = { baseline: resolve(baselineRoot), candidate: resolve(candidateRoot) };
const outputPath = resolve(output);
if ([resolve("."), reportDirectory, ...Object.values(roots)].some((root) => isWithin(outputPath, root))) {
  throw new Error("Comparison report must be outside the source, product, and task-report directories");
}

const products = {};
for (const [name, root] of Object.entries(roots)) {
  const modulePath = resolve(root, "dist/mcp/explore-text.js");
  products[name] = {
    render: (await import(pathToFileURL(modulePath).href)).renderExploreText,
    version: JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).version,
    moduleSha256: createHash("sha256").update(readFileSync(modulePath)).digest("hex")
  };
}

const names = readdirSync(reportDirectory).filter((name) => name.endsWith(".json")).sort();
assert.ok(names.length > 0, "No task-retrieval reports found");
const tasks = [];
for (const name of names) {
  const report = JSON.parse(readFileSync(resolve(reportDirectory, name), "utf8"));
  assert.ok(Array.isArray(report.results), `${name} is not a task-retrieval report`);
  for (const task of report.results) {
    const before = products.baseline.render(task.result);
    const after = products.candidate.render(task.result);
    tasks.push({ manifest: name, id: task.id, inputProductVersion: report.productVersion,
      changed: before !== after,
      baselineBytes: Buffer.byteLength(before), candidateBytes: Buffer.byteLength(after),
      baselineSha256: createHash("sha256").update(before).digest("hex"),
      candidateSha256: createHash("sha256").update(after).digest("hex") });
  }
}
const summary = { schemaVersion: 1, reportDirectory, productRoots: roots,
  products: Object.fromEntries(Object.entries(products).map(([name, product]) =>
    [name, { version: product.version, moduleSha256: product.moduleSha256 }])),
  scope: "Render identical recorded explore responses with two built MCP text renderers; excludes retrieval and source verification",
  manifests: names.length, tasks: tasks.length,
  changed: tasks.filter((task) => task.changed), unchanged: tasks.filter((task) => !task.changed).length,
  comparisons: tasks };
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ output: outputPath, manifests: summary.manifests, tasks: summary.tasks,
  changed: summary.changed, unchanged: summary.unchanged }));
