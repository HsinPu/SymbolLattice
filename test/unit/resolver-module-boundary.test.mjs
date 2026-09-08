import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { expect, it } from "vitest";

it("keeps extracted resolver modules independent from the orchestrator", () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const directory = resolve(root, "src/application/resolvers");
  const files = readdirSync(directory).filter((name) => name.endsWith(".ts"));
  expect(files.length).toBeGreaterThan(0);
  const violations = [];
  for (const name of files) {
    const file = resolve(directory, name);
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    for (const node of source.statements) {
      if (!(ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) || !node.moduleSpecifier) continue;
      if (!ts.isStringLiteral(node.moduleSpecifier)) continue;
      const target = resolve(dirname(file), node.moduleSpecifier.text).replace(/\.js$/, ".ts");
      if (target === resolve(root, "src/application/resolution.ts")) {
        violations.push(`${name}: ${node.moduleSpecifier.text}`);
      }
    }
  }
  expect(violations).toEqual([]);
});
