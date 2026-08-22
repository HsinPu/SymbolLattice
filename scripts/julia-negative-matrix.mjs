import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { extractJuliaFileFacts } from "../dist/extraction/julia.js";

function cases() {
  const result = [];
  const malformed = [
    (index) => `module Missing${index}\nstruct Broken${index}\n  value::Int`,
    (index) => `function broken${index}(value`,
    (index) => `struct Broken${index}\n  value::Int`,
    (index) => `abstract type Broken${index}`,
    (index) => `primitive type Broken${index} 32`
  ];
  const dynamic = [
    (index) => `@eval module Generated${index}\nfunction hidden${index}() = 1\nend`,
    (index) => `@generated function hidden${index}(x)\n  x\nend`,
    (index) => `@eval begin\nfunction hidden${index}() = 1\nend\nend`,
    (index) => `quote\nfunction hidden${index}() = 1\nend\nend`,
    (index) => `include_string(Main, "function hidden${index}() = 1")`
  ];
  const nested = [
    (index) => `if true\nfunction hidden${index}() = 1\nend\nend`,
    (index) => `for item in 1:1\nstruct Hidden${index}\n  value::Int\nend\nend`,
    (index) => `let\nabstract type Hidden${index} end\nend`,
    (index) => `try\nmodule Hidden${index}\nfunction hidden${index}() = 1\nend\nend\ncatch\nend`,
    (index) => `begin\nif true\nfunction hidden${index}() = 1\nend\nend\nend`
  ];
  const lookalike = [
    (index) => `foo${index}(value) == value`,
    (index) => `foo${index}(value) => value`,
    (index) => `foo${index}(value);`,
    (index) => `foo${index} = value -> value`,
    (index) => `const Foo${index} = 1`
  ];
  for (let index = 0; index < 30; index += 1) {
    result.push({ family: "quoted-fake", id: `quoted-${index + 1}`, sourceText: `const text${index} = """module Fake${index}\nfunction fake${index}() = 1\nend"""\nconst command${index} = \`function command${index}() = 1\`\nconst character${index} = 'x'\n# function comment${index}() = 1` });
    result.push({ family: "malformed", id: `malformed-${index + 1}`, sourceText: malformed[index % malformed.length](index) });
    result.push({ family: "dynamic", id: `dynamic-${index + 1}`, sourceText: dynamic[index % dynamic.length](index) });
    result.push({ family: "nested-unsafe", id: `nested-${index + 1}`, sourceText: nested[index % nested.length](index) });
    result.push({ family: "lookalike", id: `lookalike-${index + 1}`, sourceText: lookalike[index % lookalike.length](index) });
  }
  return result;
}

export function runJuliaNegativeMatrix() {
  const matrix = cases();
  const results = matrix.map((testCase) => {
    const facts = extractJuliaFileFacts({ filePath: `negative/${testCase.id}.jl`, language: "julia", sourceText: testCase.sourceText });
    const symbols = facts.symbols.filter((symbol) => symbol.kind !== "file");
    const passed = symbols.length === 0 && facts.edges.filter((edge) => edge.kind !== "contains").length === 0;
    return { id: testCase.id, family: testCase.family, passed, symbols: symbols.length, edges: facts.edges.length };
  });
  const failed = results.filter((result) => !result.passed);
  return {
    schemaVersion: 1,
    benchmark: "symbollattice-julia-negative-matrix-v1",
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
  const report = runJuliaNegativeMatrix();
  await writeFile(resolve(output), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ output: resolve(output), status: report.status, caseCount: report.caseCount, passed: report.passed, failed: report.failed }));
  if (report.status !== "pass") process.exitCode = 2;
}
