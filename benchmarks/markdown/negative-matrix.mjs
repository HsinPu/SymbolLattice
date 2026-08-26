import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { extractFileFacts } from "../../dist/extraction/index.js";
import { resolveProjectFacts } from "../../dist/application/resolution.js";

const FAMILIES = Object.freeze([
  ["opaque-code", 30],
  ["unsupported-syntax", 30],
  ["path-safety", 35],
  ["dynamic-or-anchor", 25],
  ["malformed-or-limit", 30]
]);

function sourceFor(family, index) {
  switch (family) {
    case "opaque-code":
      return [
        "```ts",
        `# Fake ${index}`,
        `[fake](../src/fake-${index}.ts)`,
        "```",
        `    # Indented ${index}`,
        `\`[inline-${index}](../src/inline-${index}.ts)\``
      ].join("\n");
    case "unsupported-syntax":
      return [
        `[reference-${index}][target-${index}]`,
        `![image-${index}](target-${index}.md)`,
        `<target-${index}.md>`,
        `<a href="target-${index}.md">fake</a>`,
        `[[wiki-${index}]]`,
        `[title-${index}](target-${index}.md "unsupported title")`
      ].join("\n");
    case "path-safety":
      return [
        `[escape-${index}](../../outside-${index}.md)`,
        `[absolute-${index}](/docs/absolute-${index}.md)`,
        `[root-${index}](\\docs\\root-${index}.md)`,
        `[case-${index}](./Guide-${index}.MD)`,
        `[missing-${index}](./missing-${index}.md)`,
        `[directory-${index}](./docs/)`,
        `[excluded-${index}](./node_modules/pkg-${index}.md)`
      ].join("\n");
    case "dynamic-or-anchor":
      return [
        `[anchor-${index}](#section-${index})`,
        `[query-only-${index}](?section=${index})`,
        `[template-${index}](${'${'}DOC_${index}})`,
        `[mustache-${index}]({{doc-${index}.md}})`,
        `[mdx-${index}](component-${index}.mdx)`,
        `[external-${index}](https://example.test/doc-${index}.md)`,
        `[protocol-${index}](mailto:docs-${index}@example.test)`
      ].join("\n");
    case "malformed-or-limit":
      if (index % 5 === 0) return `~~~\n# unterminated-${index}\n[fake](target-${index}.md)`;
      if (index % 5 === 1) return `[broken-${index}](target-${index}.md`;
      if (index % 5 === 2) return `# ${"x".repeat(2_100)}\n[fake-${index}](target-${index}.md)`;
      if (index % 5 === 3) return `[broken-${index}(target-${index}.md)`;
      return `#malformed-${index}\n\n[broken-${index}] target-${index}.md`;
    default:
      throw new Error(`Unknown negative family: ${family}`);
  }
}

export function markdownNegativeCases() {
  return FAMILIES.flatMap(([family, count]) => Array.from({ length: count }, (_, offset) => {
    const index = offset + 1;
    return {
      family,
      id: `${family}-${String(index).padStart(2, "0")}`,
      sourceText: sourceFor(family, index)
    };
  }));
}

function noIncorrectExactEdge(facts) {
  return facts.edges.every((edge) => {
    if (edge.kind === "contains") return true;
    return edge.resolution !== "exact" || edge.targetId === null || edge.confidence !== 1;
  });
}

export function runMarkdownNegativeMatrix() {
  const results = markdownNegativeCases().map((testCase) => {
    let facts;
    let error = null;
    try {
      facts = extractFileFacts({
        filePath: `negative/${testCase.id}.md`,
        language: "markdown",
        sourceText: testCase.sourceText
      });
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }
    const nonFileSymbols = facts?.symbols.filter((symbol) => symbol.kind !== "file") ?? [];
    const graph = facts === undefined
      ? null
      : resolveProjectFacts({
          sourceDocuments: [{
            absolutePath: `C:/negative/${testCase.id}.md`,
            relativePath: `negative/${testCase.id}.md`,
            language: "markdown",
            sourceText: testCase.sourceText,
            contentHash: testCase.id
          }],
          extractedFiles: [facts],
          indexedAt: "2026-08-26T00:00:00.000Z"
        });
    const passed = error === null && nonFileSymbols.length === 0 && graph !== null && noIncorrectExactEdge(graph);
    return {
      id: testCase.id,
      family: testCase.family,
      passed,
      nonFileSymbols: nonFileSymbols.length,
      edges: graph?.edges.length ?? 0,
      exactEdges: graph?.edges.filter((edge) => edge.resolution === "exact" && edge.targetId !== null).length ?? 0,
      error
    };
  });
  const failed = results.filter((result) => !result.passed);
  return {
    schemaVersion: 1,
    benchmark: "symbollattice-markdown-negative-matrix-v1",
    caseCount: results.length,
    familyCounts: Object.fromEntries(FAMILIES.map(([family]) => [family, results.filter((result) => result.family === family).length])),
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
  const report = runMarkdownNegativeMatrix();
  await writeFile(resolve(output), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ output: resolve(output), status: report.status, caseCount: report.caseCount, passed: report.passed, failed: report.failed }));
  if (report.status !== "pass") process.exitCode = 2;
}
