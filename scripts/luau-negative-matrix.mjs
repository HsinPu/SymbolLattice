import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { extractLuaFileFacts } from "../dist/extraction/lua.js";

function cases() {
  const result = [];
  for (let index = 0; index < 30; index += 1) {
    result.push({
      family: "malformed-generic-head",
      id: `generic-${index + 1}`,
      sourceText: `local function broken<T${index}(value: T): T\n  return value\nend`
    });
    result.push({
      family: "malformed-type-alias",
      id: `alias-${index + 1}`,
      sourceText: `export type Missing${index} = { name: string`
    });
    result.push({
      family: "nested-function",
      id: `nested-${index + 1}`,
      sourceText: `local function outer${index}(): number\n  local function inner${index}(): number\n    return 1\n  end\n  return inner${index}()\nend`
    });
    result.push({
      family: "dynamic-member-call",
      id: `member-${index + 1}`,
      sourceText: `local function target${index}(): number\n  return 1\nend\nlocal function entry${index}(): number\n  local receiver = {}\n  return receiver[target${index}]()\nend`
    });
    result.push({
      family: "duplicate-target-call",
      id: `duplicate-${index + 1}`,
      sourceText: `local function target${index}(): number\n  return 1\nend\nlocal function target${index}(): number\n  return 2\nend\nlocal function entry${index}(): number\n  return target${index}()\nend`
    });
  }
  return result;
}

export function runLuauNegativeMatrix() {
  const matrix = cases();
  const results = matrix.map((testCase) => {
    const facts = extractLuaFileFacts({
      filePath: `negative/${testCase.id}.luau`,
      language: "luau",
      sourceText: testCase.sourceText
    });
    const functions = facts.symbols.filter((symbol) => symbol.kind === "function" || symbol.kind === "method");
    const typeAliases = facts.symbols.filter((symbol) => symbol.kind === "type");
    const callEdges = facts.edges.filter((edge) => edge.kind === "calls");
    let passed;
    if (testCase.family === "malformed-generic-head") passed = !functions.some((symbol) => symbol.name === "broken");
    else if (testCase.family === "malformed-type-alias") passed = typeAliases.length === 0;
    else if (testCase.family === "nested-function") passed = functions.some((symbol) => symbol.name.startsWith("outer")) && !functions.some((symbol) => symbol.name.startsWith("inner"));
    else passed = callEdges.length === 0;
    return { id: testCase.id, family: testCase.family, passed, symbols: functions.length + typeAliases.length, calls: callEdges.length };
  });
  const failed = results.filter((result) => !result.passed);
  return {
    schemaVersion: 1,
    benchmark: "symbollattice-luau-negative-matrix-v1",
    caseCount: results.length,
    familyCounts: Object.fromEntries([...new Set(results.map((result) => result.family))].map((family) => [family, results.filter((result) => result.family === family).length])),
    passed: results.length - failed.length,
    failed: failed.length,
    results,
    status: failed.length === 0 ? "pass" : "fail"
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = process.argv[process.argv.indexOf("--output") + 1];
  if (!output) throw new Error("Usage: --output <json>");
  const report = runLuauNegativeMatrix();
  await writeFile(resolve(output), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ output: resolve(output), status: report.status, caseCount: report.caseCount, passed: report.passed, failed: report.failed }));
  if (report.status !== "pass") process.exitCode = 2;
}
