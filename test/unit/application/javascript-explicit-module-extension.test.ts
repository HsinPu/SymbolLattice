import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveProjectFacts } from "../../../src/application/resolution.js";
import { extractFileFacts } from "../../../src/extraction/index.js";
import { createTypeScriptProjectModuleResolver } from "../../../src/infrastructure/typescript/module-resolver.js";
import type { SourceDocument } from "../../../src/ports/source-catalog.js";

let projectPath: string;
beforeAll(async () => {
  projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-js-explicit-"));
  await writeFile(join(projectPath, "jsconfig.json"), JSON.stringify({ compilerOptions: { allowJs: true } }));
});
afterAll(async () => { if (projectPath) await rm(projectPath, { recursive: true, force: true }); });

function snapshot(mode: string, importer: string, specifier: string, reexport = false) {
  const files = { [importer]: reexport ? `export { default } from '${specifier}';` : importer.endsWith(".cjs") ? `const value = require('${specifier}');` : `import value from '${specifier}';`,
    "target.js": "export default 1;", "target.cjs": "module.exports = 2;", "target.mjs": "export default 3;" };
  const sourceDocuments: SourceDocument[] = Object.entries(files).map(([relativePath, sourceText]) => ({
    relativePath, absolutePath: join(projectPath, relativePath), sourceText, contentHash: sourceText,
    language: /\.(?:[cm]?ts|tsx)$/.test(relativePath) ? "typescript" : "javascript"
  }));
  const configured = mode === "project" ? createTypeScriptProjectModuleResolver({ projectPath, sourceDocuments }) : undefined;
  if (configured) expect(configured.configurationInputs).toEqual(expect.arrayContaining([
    expect.objectContaining({ path: "jsconfig.json", state: "present", contentHash: expect.any(String) })
  ]));
  return resolveProjectFacts({ sourceDocuments,
    extractedFiles: sourceDocuments.map((doc) => extractFileFacts({ filePath: doc.relativePath, language: doc.language, sourceText: doc.sourceText })),
    ...(configured ? { moduleResolver: configured.moduleResolver } : {}),
    indexedAt: "2026-09-09T00:00:00Z"
  });
}

describe.each(["fallback", "project"])("JavaScript explicit module extension (%s)", (mode) => {
  it.each(["js", "mjs", "cjs"])("resolves explicit .%s re-export to the literal file", (extension) => {
    const graph = snapshot(mode, "entry.js", `./target.${extension}`, true);
    const target = graph.symbols.find((symbol) => symbol.kind === "file" && symbol.filePath === `target.${extension}`)!;
    const edges = graph.edges.filter((edge) => edge.kind === "exports" && edge.filePath === "entry.js");
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ targetId: target.id, resolution: "exact", confidence: 1,
      evidence: { candidateSymbolIds: [target.id] } });
  });
  it.each(["entry.jsx", "entry.JS"])("does not expand the importer contract to %s", (importer) => {
    const graph = snapshot(mode, importer, "./target.js");
    expect(graph.edges.filter((edge) => edge.kind === "imports" && edge.resolution === "exact")).toHaveLength(0);
  });
  it.each(["./target.js/", "./target.js/."])("does not treat directory-like %s as an explicit file", (specifier) => {
    const graph = snapshot(mode, "entry.js", specifier);
    expect(graph.edges.filter((edge) => edge.kind === "imports" && edge.resolution === "exact")).toHaveLength(0);
  });
  it.each(["entry.js", "entry.mjs", "entry.cjs"].flatMap((importer) =>
    ["js", "mjs", "cjs"].map((extension) => ({ importer, extension }))
  ))("resolves $importer to explicit .$extension despite alternate JavaScript files", ({ importer, extension }) => {
    const graph = snapshot(mode, importer, `./target.${extension}`);
    const target = graph.symbols.find((symbol) => symbol.kind === "file" && symbol.filePath === `target.${extension}`)!;
    const edges = graph.edges.filter((edge) => edge.kind === "imports" && edge.filePath === importer);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ targetId: target.id, resolution: "exact", confidence: 1,
      evidence: { candidateSymbolIds: [target.id] } });
  });
  it("keeps extensionless alternatives unresolved", () => {
    const graph = snapshot(mode, "entry.js", "./target");
    expect(graph.edges.filter((edge) => edge.kind === "imports" && edge.resolution === "exact")).toHaveLength(0);
  });
  it.each(["entry.ts", "entry.tsx", "entry.mts", "entry.cts"])("preserves TypeScript extension-substitution ambiguity for %s", (importer) => {
    const graph = snapshot(mode, importer, "./target.js");
    expect(graph.edges.filter((edge) => edge.kind === "imports" && edge.resolution === "exact")).toHaveLength(0);
  });
});
