import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import ts from "typescript";
import { afterEach, describe, expect, test } from "vitest";

import { compilerProvenArraySortComparator } from "../../../scripts/typescript-self-hosting-ground-truth.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function comparatorCandidates(sourceText) {
  const directory = await mkdtemp(join(tmpdir(), "symbol-lattice-ts-ground-truth-"));
  temporaryDirectories.push(directory);
  const path = join(directory, "fixture.ts");
  await writeFile(path, sourceText, "utf8");
  const program = ts.createProgram([path], { strict: true, noEmit: true, target: ts.ScriptTarget.ES2022 });
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(path);
  const candidates = [];
  const visit = (node) => {
    const candidate = compilerProvenArraySortComparator(checker, node);
    if (candidate !== undefined) candidates.push(candidate.text);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return candidates;
}

describe("TypeScript self-hosting ground-truth comparator oracle", () => {
  test("independently recognizes an identifier passed to built-in Array.sort", async () => {
    await expect(comparatorCandidates(`
      function compare(left: string, right: string): number { return left.localeCompare(right); }
      const paths: string[] = [];
      paths.sort(compare);
    `)).resolves.toEqual(["compare"]);
  });

  test("does not trust custom sort methods or non-identifier callbacks", async () => {
    await expect(comparatorCandidates(`
      function compare(left: string, right: string): number { return left.localeCompare(right); }
      const custom = { sort(callback: (left: string, right: string) => number) { return callback("a", "b"); } };
      custom.sort(compare);
      const paths: string[] = [];
      paths.sort((left, right) => compare(left, right));
    `)).resolves.toEqual([]);
  });
});
