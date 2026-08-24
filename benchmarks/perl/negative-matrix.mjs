import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { extractPerlFileFacts } from "../../dist/extraction/perl.js";

export function perlNegativeCases() {
  const result = [];
  const quoted = [
    (index) => `my $text${index} = q{sub fake${index} { return 1 }};`,
    (index) => `my $text${index} = qq{package Fake${index}; sub hidden${index} {}};`,
    (index) => `my $text${index} = q[sub hidden${index};];`,
    (index) => `my $text${index} = qr/sub hidden${index}/;`,
    (index) => `my $text${index} = "sub fake${index} { return 1 }";`
  ];
  const malformed = [
    (index) => `package Broken${index};\nsub missing${index} {\n  return 1;`,
    (index) => `package Broken${index};\nsub missing${index}(\n`,
    (index) => `package Broken${index};\nmy $x = q{unclosed`,
    (index) => `class Broken${index} {\n  sub hidden${index} { 1 }`,
    (index) => `role Broken${index} {\n  has value;`
  ];
  const dynamic = [
    (index) => `eval 'sub generated${index} { 1 }';`,
    (index) => `eval q{package Generated${index}; sub generated${index} { 1 }};`,
    (index) => `do "generated${index}.pl";`,
    (index) => `require "generated${index}.pm";`,
    (index) => `my $code${index} = sub { sub nested${index} { 1 } };`
  ];
  const nested = [
    (index) => `if (1) { sub hidden${index} { 1 } }`,
    (index) => `BEGIN { sub hidden${index} { 1 } }`,
    (index) => `for my $item${index} (1) { sub hidden${index} { 1 } }`,
    (index) => `my $factory${index} = sub { return sub { 1 } };`,
    (index) => `my $outer${index} = sub { sub inner${index} { 1 } };`
  ];
  const lookalike = [
    (index) => `my $sub${index} = "fake";`,
    (index) => `my $package${index} = "fake";`,
    (index) => `sub${index} { 1 }`,
    (index) => `use constant package${index} => "fake";`,
    (index) => `class${index} Fake${index};`
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

export function runPerlNegativeMatrix() {
  const matrix = perlNegativeCases();
  const results = matrix.map((testCase) => {
    const facts = extractPerlFileFacts({ filePath: `negative/${testCase.id}.pm`, language: "perl", sourceText: testCase.sourceText });
    const symbols = facts.symbols.filter((symbol) => symbol.kind !== "file");
    const passed = symbols.length === 0 && facts.edges.filter((edge) => edge.kind !== "contains").length === 0;
    return { id: testCase.id, family: testCase.family, passed, symbols: symbols.length, edges: facts.edges.length };
  });
  const failed = results.filter((result) => !result.passed);
  return {
    schemaVersion: 1,
    benchmark: "symbollattice-perl-negative-matrix-v1",
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
  const report = runPerlNegativeMatrix();
  await writeFile(resolve(output), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ output: resolve(output), status: report.status, caseCount: report.caseCount, passed: report.passed, failed: report.failed }));
  if (report.status !== "pass") process.exitCode = 2;
}
