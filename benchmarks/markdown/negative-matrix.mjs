import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { SqliteGraphStore } from "../../dist/infrastructure/sqlite/index.js";

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
      if (index % 3 === 1) {
        return [`\`[hidden](target-${index}.md)`, `[still-hidden](target-${index}.md)`].join("\n");
      }
      if (index % 3 === 2) {
        return [`<!doctype html>`, `[hidden](target-${index}.md)`].join("\n");
      }
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
        `[outer [inner](target-${index}.md)](outer.md)`,
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

function writeProjectFile(project, relativePath, sourceText) {
  const absolute = join(project, ...relativePath.split("/"));
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, sourceText, "utf8");
}

function decoyPaths(testCase, index) {
  const paths = [
    `negative/target-${index}.md`,
    "negative/target.md",
    "negative/outer.md"
  ];
  if (testCase.family === "opaque-code") {
    paths.push(`src/fake-${index}.ts`, `src/inline-${index}.ts`);
  } else if (testCase.family === "path-safety") {
    paths.push(
      `outside-${index}.md`,
      `docs/absolute-${index}.md`,
      `docs/root-${index}.md`,
      `negative/guide-${index}.md`,
      `negative/docs/index-${index}.md`,
      `node_modules/pkg-${index}.md`
    );
  } else if (testCase.family === "dynamic-or-anchor") {
    paths.push(`negative/doc-${index}.md`, `negative/component-${index}.mdx`);
  }
  return paths;
}

function runCli(command, project) {
  const cli = resolve(dirname(fileURLToPath(import.meta.url)), "../../dist/cli/main.js");
  const result = spawnSync(process.execPath, [cli, command, project, "--json"], {
    cwd: dirname(cli),
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024
  });
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.stdout}`);
  return JSON.parse(result.stdout);
}

export function runMarkdownNegativeMatrix() {
  const workspace = mkdtempSync(join(tmpdir(), "markdown-v0449-negative-"));
  const project = join(workspace, "project");
  mkdirSync(project, { recursive: true });
  const cases = markdownNegativeCases();
  const decoys = new Set();
  try {
    cases.forEach((testCase) => {
      const index = Number(testCase.id.slice(-2));
      writeProjectFile(project, `negative/${testCase.id}.md`, testCase.sourceText);
      for (const relativePath of decoyPaths(testCase, index)) {
        decoys.add(relativePath);
        writeProjectFile(project, relativePath, relativePath.endsWith(".ts") ? "export const decoy = true;\n" : "decoy\n");
      }
    });
    const init = runCli("init", project);
    const store = new SqliteGraphStore({ readOnly: true });
    let graph;
    try {
      graph = store.getSnapshot(project);
    } finally {
      store.close();
    }
    const results = cases.map((testCase) => {
      const filePath = `negative/${testCase.id}.md`;
      const nonFileSymbols = graph.symbols.filter((symbol) => symbol.filePath === filePath && symbol.kind !== "file");
      const references = graph.edges.filter((edge) => edge.filePath === filePath && edge.kind === "references");
      const exactReferences = references.filter((edge) => edge.resolution === "exact" && edge.targetId !== null);
      return {
        id: testCase.id,
        family: testCase.family,
        passed: nonFileSymbols.length === 0 && exactReferences.length === 0,
        nonFileSymbols: nonFileSymbols.length,
        referenceEdges: references.length,
        exactReferenceEdges: exactReferences.length,
        error: null
      };
    });
    const failed = results.filter((result) => !result.passed);
    const totalExactReferenceEdges = results.reduce((sum, result) => sum + result.exactReferenceEdges, 0);
    return {
      schemaVersion: 1,
      benchmark: "symbollattice-markdown-negative-matrix-v2",
      caseCount: results.length,
      familyCounts: Object.fromEntries(FAMILIES.map(([family]) => [family, results.filter((result) => result.family === family).length])),
      proof: {
        method: "disposable-discovery-and-init-with-decoy-targets",
        indexedFiles: init.counts.files,
        decoyTargetFiles: decoys.size,
        totalExactReferenceEdges
      },
      passed: results.length - failed.length,
      failed: failed.length,
      results,
      status: failed.length === 0 ? "pass" : "fail"
    };
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outputIndex = process.argv.indexOf("--output");
  const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined;
  if (!output) throw new Error("Usage: --output <json>");
  const report = runMarkdownNegativeMatrix();
  writeFileSync(resolve(output), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ output: resolve(output), status: report.status, caseCount: report.caseCount, passed: report.passed, failed: report.failed }));
  if (report.status !== "pass") process.exitCode = 2;
}
