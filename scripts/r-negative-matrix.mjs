import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { extractRFileFacts } from "../dist/extraction/r.js";

export function rNegativeCases() {
  const result = [];
  const quoted = [
    (index) => `text${index} <- "hidden${index} <- function() { 1 }"`,
    (index) => `text${index} <- 'setClass("Fake${index}", slots = list())'`,
    (index) => `text${index} <- \`setClass("Fake${index}", slots = list())\``,
    (index) => `# hidden${index} <- function() { 1 }`,
    (index) => `paste0("hidden${index} <- function() { 1 }")`
  ];
  const malformed = [
    (index) => `hidden${index} <- function(x) {`,
    (index) => `setClass("Broken${index}", slots = list(`,
    (index) => `text${index} <- "unterminated`,
    (index) => `if (TRUE) { hidden${index} <- function() { 1 }`,
    (index) => `hidden${index} <- function(x] { 1 }`
  ];
  const dynamic = [
    (index) => `name${index} <- paste0("Dynamic", ${index})\nsetClass(name${index}, slots = list())`,
    (index) => `setClass(paste0("Dynamic", ${index}), slots = list())`,
    (index) => `eval(parse(text = "setClass('Generated', slots = list())"))`,
    (index) => `source("generated${index}.R")`,
    (index) => `do.call(setClass, list("Generated${index}"))`
  ];
  const nested = [
    (index) => `if (TRUE) {\n  setClass("Nested${index}", slots = list())\n}`,
    (index) => `for (item${index} in 1:2) {\n  hidden${index} <- function() { 1 }\n}`,
    (index) => `local({ setClass("Nested${index}", slots = list()) })`,
    (index) => `if (TRUE) {\n  inner${index} <- function() { 1 }\n}`,
    (index) => `with(list(), setClass("Nested${index}", slots = list()))`
  ];
  const lookalike = [
    (index) => `setClass${index}("Fake", slots = list())`,
    (index) => `setRefClass${index}("Fake", fields = list())`,
    (index) => `setClass${index} <- 1`,
    (index) => `className${index} <- "Fake"`,
    (index) => `setClassName${index} <- 1`
  ];
  for (let index = 0; index < 30; index += 1) {
    result.push({ family: "quoted-fake", id: `quoted-${index + 1}`, sourceText: quoted[index % quoted.length](index) });
    result.push({ family: "malformed", id: `malformed-${index + 1}`, sourceText: malformed[index % malformed.length](index) });
    result.push({ family: "dynamic", id: `dynamic-${index + 1}`, sourceText: dynamic[index % dynamic.length](index) });
    result.push({ family: "nested-unsafe", id: `nested-${index + 1}`, sourceText: nested[index % nested.length](index) });
    result.push({ family: "lookalike", id: `lookalike-${index + 1}`, sourceText: lookalike[index % lookalike.length](index) });
  }
  return result;
}

export function runRNegativeMatrix() {
  const matrix = rNegativeCases();
  const results = matrix.map((testCase) => {
    const facts = extractRFileFacts({ filePath: `negative/${testCase.id}.r`, language: "r", sourceText: testCase.sourceText });
    const symbols = facts.symbols.filter((symbol) => symbol.kind !== "file");
    const passed = symbols.length === 0 && facts.edges.filter((edge) => edge.kind !== "contains").length === 0;
    return { id: testCase.id, family: testCase.family, passed, symbols: symbols.length, edges: facts.edges.length };
  });
  const failed = results.filter((result) => !result.passed);
  return {
    schemaVersion: 1,
    benchmark: "symbollattice-r-negative-matrix-v1",
    caseCount: results.length,
    familyCounts: Object.fromEntries([...new Set(results.map((result) => result.family))].map((family) => [family, results.filter((result) => result.family === family).length])),
    passed: results.length - failed.length,
    failed: failed.length,
    results,
    status: failed.length === 0 ? "pass" : "fail"
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outputIndex = process.argv.indexOf("--output");
  const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined;
  if (!output) throw new Error("Usage: --output <json>");
  const report = runRNegativeMatrix();
  await writeFile(resolve(output), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ output: resolve(output), status: report.status, caseCount: report.caseCount, passed: report.passed, failed: report.failed }));
  if (report.status !== "pass") process.exitCode = 2;
}
