import { describe, expect, it } from "vitest";

import {
  buildFileLanguageGroups,
  buildFileTree,
  decodeFilePageCursor,
  encodeFilePageCursor,
  fileSelectionFingerprint,
  matchesProjectFileGlob,
  matchesProjectPathPrefix
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

  it("matches exact files and directory descendants without crossing path segments", () => {
    expect(matchesProjectPathPrefix("src", "src")).toBe(true);
    expect(matchesProjectPathPrefix("src/api.ts", "src")).toBe(true);
    expect(matchesProjectPathPrefix("src/api/user.ts", "src/api")).toBe(true);
    expect(matchesProjectPathPrefix("src2/not-under-src.ts", "src")).toBe(false);
    expect(matchesProjectPathPrefix("src/apiary.ts", "src/api")).toBe(false);
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

  it("round-trips a canonical opaque cursor bound to one generation and selection", () => {
    const selectionFingerprint = fileSelectionFingerprint({
      pathPrefix: "src",
      language: "typescript",
      pattern: "**/*.ts"
    });
    const cursor = encodeFilePageCursor({
      generationId: "generation:one",
      selectionFingerprint,
      afterFilePath: "src/api.ts"
    });

    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeFilePageCursor(cursor)).toEqual({
      schemaVersion: 1,
      generationId: "generation:one",
      selectionFingerprint,
      afterFilePath: "src/api.ts"
    });
    expect(() => decodeFilePageCursor("not+a+canonical+cursor")).toThrow();
    expect(() => decodeFilePageCursor(`${cursor}x`)).toThrow();
    expect(() => decodeFilePageCursor("a".repeat(2049))).toThrow();

    const invalidUtf8Cursor = Buffer.concat([
      Buffer.from(`{"schemaVersion":1,"generationId":"generation:one","selectionFingerprint":"${selectionFingerprint}","afterFilePath":"`, "utf8"),
      Buffer.from([0xff]),
      Buffer.from('"}', "utf8")
    ]).toString("base64url");
    expect(() => decodeFilePageCursor(invalidUtf8Cursor)).toThrow();
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
    generated: {
      classifierVersion: "generated-evidence-v1",
      generated: false,
      evidence: []
    },
    sourceRole: {
      classifierVersion: "source-role-evidence-v2",
      role: filePath.includes("test") ? "test" : "production",
      evidence: []
    },
    declarationCount: 1,
    edgeCount: 2,
    pendingReferenceCount: 0
  };
}
