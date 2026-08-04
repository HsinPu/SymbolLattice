import { describe, expect, it } from "vitest";

import {
  buildFileLanguageGroups,
  buildFileTree,
  matchesProjectFileGlob
} from "../../../src/application/file-inventory.js";
import type { IndexedFileSummary } from "../../../src/application/types.js";

describe("persisted file inventory projections", () => {
  it("anchors glob patterns to project-relative paths with explicit globstar semantics", () => {
    expect(matchesProjectFileGlob("root.ts", "*.ts")).toBe(true);
    expect(matchesProjectFileGlob("src/root.ts", "*.ts")).toBe(false);
    expect(matchesProjectFileGlob("root.ts", "**/*.ts")).toBe(true);
    expect(matchesProjectFileGlob("src/root.ts", "**/*.ts")).toBe(true);
    expect(matchesProjectFileGlob("src/a/test1.ts", "src/**/test?.ts")).toBe(true);
    expect(matchesProjectFileGlob("src/a/test10.ts", "src/**/test?.ts")).toBe(false);
    expect(matchesProjectFileGlob("file.name.ts", "file.name.ts")).toBe(true);
    expect(matchesProjectFileGlob("fileXname.ts", "file.name.ts")).toBe(false);
    expect(matchesProjectFileGlob("src/[draft]+.ts", "src/[draft]+.ts")).toBe(true);
  });

  it("builds a deterministic directory-first tree and discloses depth-limited descendants", () => {
    const tree = buildFileTree([
      file("README.md", "markdown" as never),
      file("src/z.ts", "typescript"),
      file("src/api/a.ts", "typescript")
    ], 1);

    expect(tree).toEqual({
      returnedFileCount: 3,
      children: [
        {
          kind: "directory",
          name: "src",
          path: "src",
          returnedFileCount: 2,
          depthLimited: true,
          children: []
        },
        {
          kind: "file",
          name: "README.md",
          path: "README.md",
          file: file("README.md", "markdown" as never)
        }
      ]
    });
  });

  it("groups by language using count-descending and stable language ordering", () => {
    expect(buildFileLanguageGroups([
      file("src/b.ts", "typescript"),
      file("scripts/task.py", "python"),
      file("src/a.ts", "typescript"),
      file("app.rb", "ruby")
    ])).toEqual([
      {
        language: "typescript",
        fileCount: 2,
        files: [file("src/a.ts", "typescript"), file("src/b.ts", "typescript")]
      },
      { language: "python", fileCount: 1, files: [file("scripts/task.py", "python")] },
      { language: "ruby", fileCount: 1, files: [file("app.rb", "ruby")] }
    ]);
  });
});

function file(
  filePath: string,
  language: IndexedFileSummary["language"]
): IndexedFileSummary {
  return {
    filePath,
    language,
    indexedAt: "2026-08-04T00:00:00.000Z",
    declarationCount: 1,
    edgeCount: 2,
    pendingReferenceCount: 0
  };
}
