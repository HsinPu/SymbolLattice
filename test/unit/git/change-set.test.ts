import { describe, expect, it, vi } from "vitest";

import {
  FileSystemGitChangeSetProvider,
  gitSourcePaths,
  parseGitNameStatusZ,
  parseGitPathsZ,
  type GitCommandRunner
} from "../../../src/infrastructure/git/index.js";
import { GitChangeSetError } from "../../../src/ports/index.js";

const HEAD = "a".repeat(40);
const BASE = "b".repeat(40);
const MERGE_BASE = "c".repeat(40);

describe("Git change-set NUL parsers", () => {
  it("retains whitespace/newlines and both paths for rename/copy records", () => {
    const changes = parseGitNameStatusZ(
      "M\u0000src/space name.ts\u0000D\u0000src/deleted.ts\u0000R87\u0000src/old\nname.ts\u0000src/new name.ts\u0000C100\u0000src/copy-from.js\u0000src/copy-to.js\u0000"
    );

    expect(changes).toEqual([
      {
        kind: "copied",
        previousPath: "src/copy-from.js",
        currentPath: "src/copy-to.js",
        score: 100
      },
      { kind: "deleted", previousPath: "src/deleted.ts", currentPath: null, score: null },
      {
        kind: "renamed",
        previousPath: "src/old\nname.ts",
        currentPath: "src/new name.ts",
        score: 87
      },
      {
        kind: "modified",
        previousPath: "src/space name.ts",
        currentPath: "src/space name.ts",
        score: null
      }
    ]);
  });

  it("rejects missing NUL terminators and incomplete rename records", () => {
    expect(() => parseGitNameStatusZ("M\u0000src/example.ts")).toThrow(GitChangeSetError);
    expect(() => parseGitNameStatusZ("R100\u0000src/old.ts\u0000")).toThrow(GitChangeSetError);
    expect(() => parseGitNameStatusZ("A99\u0000src/example.ts\u0000")).toThrow(GitChangeSetError);
    expect(() => parseGitNameStatusZ("R\u0000src/old.ts\u0000src/new.ts\u0000")).toThrow(
      GitChangeSetError
    );
  });

  it("preserves a literal POSIX backslash in a Git pathname", () => {
    expect(parseGitNameStatusZ("M\u0000src\\name.ts\u0000")).toEqual([
      {
        kind: "modified",
        previousPath: "src\\name.ts",
        currentPath: "src\\name.ts",
        score: null
      }
    ]);
  });

  it("parses and deduplicates NUL-separated untracked paths", () => {
    expect(parseGitPathsZ("src/new.ts\u0000src/new.ts\u0000notes file.txt\u0000")).toEqual([
      "notes file.txt",
      "src/new.ts"
    ]);
  });

  it("selects only supported source paths while retaining both rename sides", () => {
    const changes = parseGitNameStatusZ(
      "R90\u0000src/old.ts\u0000src/new.ts\u0000M\u0000README.md\u0000D\u0000src/legacy.jsx\u0000A\u0000src/api.py\u0000A\u0000node_modules/example.ts\u0000"
    );

    expect(gitSourcePaths(changes)).toEqual([
      "README.md",
      "src/api.py",
      "src/legacy.jsx",
      "src/new.ts",
      "src/old.ts"
    ]);
  });
});

describe("FileSystemGitChangeSetProvider", () => {
  it("uses local argv-only Git commands to combine tracked and untracked working-tree paths", async () => {
    const calls: Array<{ projectPath: string; arguments_: readonly string[] }> = [];
    const runner: GitCommandRunner = {
      async run(projectPath, arguments_) {
        calls.push({ projectPath, arguments_ });
        if (arguments_[0] === "rev-parse") {
          return `${HEAD}\n`;
        }
        if (arguments_[0] === "diff") {
          return "M\u0000src/math.ts\u0000R100\u0000src/old.ts\u0000src/new.ts\u0000";
        }
        if (arguments_[0] === "ls-files") {
          return "src/new.test.ts\u0000README.md\u0000src/new.ts\u0000";
        }
        throw new Error(`Unexpected Git command: ${arguments_.join(" ")}`);
      }
    };

    const result = await new FileSystemGitChangeSetProvider(runner).getChangeSet("C:/project", {
      mode: "working-tree"
    });

    expect(result).toEqual({
      requestedBaseRef: null,
      mergeBaseCommit: null,
      headCommit: HEAD,
      includesUntracked: true,
      changes: [
        {
          kind: "added",
          previousPath: null,
          currentPath: "README.md",
          score: null
        },
        {
          kind: "modified",
          previousPath: "src/math.ts",
          currentPath: "src/math.ts",
          score: null
        },
        {
          kind: "added",
          previousPath: null,
          currentPath: "src/new.test.ts",
          score: null
        },
        {
          kind: "renamed",
          previousPath: "src/old.ts",
          currentPath: "src/new.ts",
          score: 100
        }
      ],
      sourcePaths: ["README.md", "src/math.ts", "src/new.test.ts", "src/new.ts", "src/old.ts"]
    });
    expect(calls).toEqual(
      expect.arrayContaining([
        {
          projectPath: "C:/project",
          arguments_: ["rev-parse", "--verify", "--quiet", "--end-of-options", "HEAD^{commit}"]
        }
      ])
    );
    const diffCall = calls.find((call) => call.arguments_[0] === "diff");
    expect(diffCall?.arguments_).toEqual(
      expect.arrayContaining(["--relative", "--no-ext-diff", "--no-textconv", HEAD])
    );
  });

  it("uses a local merge-base-to-HEAD comparison for an explicit base ref", async () => {
    const runner = {
      run: vi.fn(async (_projectPath: string, arguments_: readonly string[]) => {
        if (arguments_[0] === "rev-parse" && arguments_.at(-1) === "HEAD^{commit}") {
          return `${HEAD}\n`;
        }
        if (arguments_[0] === "rev-parse" && arguments_.at(-1) === "origin/main^{commit}") {
          return `${BASE}\n`;
        }
        if (arguments_[0] === "merge-base") {
          return `${MERGE_BASE}\n`;
        }
        if (arguments_[0] === "diff") {
          return "D\u0000src/removed.ts\u0000";
        }
        throw new Error(`Unexpected Git command: ${arguments_.join(" ")}`);
      })
    } satisfies GitCommandRunner;

    const result = await new FileSystemGitChangeSetProvider(runner).getChangeSet("C:/project", {
      mode: "base",
      baseRef: "origin/main"
    });

    expect(result).toMatchObject({
      requestedBaseRef: "origin/main",
      mergeBaseCommit: MERGE_BASE,
      headCommit: HEAD,
      includesUntracked: false,
      changes: [
        {
          kind: "deleted",
          previousPath: "src/removed.ts",
          currentPath: null
        }
      ],
      sourcePaths: ["src/removed.ts"]
    });
    expect(runner.run).toHaveBeenCalledWith(
      "C:/project",
      expect.arrayContaining(["diff", "--no-ext-diff", "--no-textconv", MERGE_BASE, HEAD])
    );
  });

  it("retains an untracked recreation when its path matches a tracked deletion", async () => {
    const runner = {
      run: vi.fn(async (_projectPath: string, arguments_: readonly string[]) => {
        if (arguments_[0] === "rev-parse") {
          return `${HEAD}\n`;
        }
        if (arguments_[0] === "diff") {
          return "D\u0000src/recreated.ts\u0000";
        }
        if (arguments_[0] === "ls-files") {
          return "src/recreated.ts\u0000";
        }
        throw new Error(`Unexpected Git command: ${arguments_.join(" ")}`);
      })
    } satisfies GitCommandRunner;

    const result = await new FileSystemGitChangeSetProvider(runner).getChangeSet("C:/project", {
      mode: "working-tree"
    });

    expect(result.changes).toEqual([
      {
        kind: "added",
        previousPath: null,
        currentPath: "src/recreated.ts",
        score: null
      },
      {
        kind: "deleted",
        previousPath: "src/recreated.ts",
        currentPath: null,
        score: null
      }
    ]);
    expect(result.sourcePaths).toEqual(["src/recreated.ts"]);
  });

  it("maps unavailable Git and invalid base failures to typed port errors", async () => {
    const unavailable = new FileSystemGitChangeSetProvider({
      async run() {
        const error = new Error("spawn git ENOENT") as Error & { code: string };
        error.code = "ENOENT";
        throw error;
      }
    });
    await expect(unavailable.getChangeSet("C:/project", { mode: "working-tree" })).rejects.toMatchObject({
      code: "GIT_UNAVAILABLE"
    });

    const invalidBase = new FileSystemGitChangeSetProvider({
      async run(_projectPath, arguments_) {
        if (arguments_.at(-1) === "HEAD^{commit}") {
          return `${HEAD}\n`;
        }
        throw new Error("unknown revision");
      }
    });
    await expect(
      invalidBase.getChangeSet("C:/project", { mode: "base", baseRef: "missing" })
    ).rejects.toMatchObject({ code: "INVALID_GIT_BASE" });
  });
});

describe("FileSystemGitChangeSetProvider immutable revision hunks", () => {
  it("keeps full provenance while reading add/delete/modify/rename hunks and blobs from resolved commits", async () => {
    const calls: Array<{ projectPath: string; arguments_: readonly string[] }> = [];
    const runner = {
      run: vi.fn(async (projectPath: string, arguments_: readonly string[]) => {
        calls.push({ projectPath, arguments_ });
        if (arguments_[0] === "rev-parse" && arguments_.includes("--show-prefix")) {
          return "\n";
        }
        if (arguments_[0] === "rev-parse" && arguments_.at(-1) === "HEAD^{commit}") {
          return `${HEAD}\n`;
        }
        if (arguments_[0] === "rev-parse" && arguments_.at(-1) === "origin/main^{commit}") {
          return `${BASE}\n`;
        }
        if (arguments_[0] === "merge-base") {
          return `${MERGE_BASE}\n`;
        }
        if (arguments_[0] === "diff" && arguments_.includes("--name-status")) {
          return (
            "M\u0000README.md\u0000" +
            "A\u0000src/added.ts\u0000" +
            "D\u0000src/deleted.ts\u0000" +
            "M\u0000src/modified.ts\u0000" +
            "R90\u0000src/old.ts\u0000src/renamed.ts\u0000"
          );
        }
        if (arguments_[0] === "diff" && arguments_.includes("--unified=0")) {
          const pathspecs = arguments_.slice(arguments_.indexOf("--") + 1);
          if (pathspecs.includes(":(literal)README.md")) {
            return "@@ -1 +1 @@\n-# Before\n+# After\n";
          }
          if (pathspecs.includes(":(literal)src/added.ts")) {
            return "@@ -0,0 +1,2 @@\n+export const added = true;\n";
          }
          if (pathspecs.includes(":(literal)src/deleted.ts")) {
            return "@@ -2,2 +0,0 @@\n-const deleted = true;\n";
          }
          if (pathspecs.includes(":(literal)src/modified.ts")) {
            return "@@ -4 +4 @@\n-export const oldValue = 1;\n+export const newValue = 2;\n";
          }
          if (pathspecs.includes(":(literal)src/renamed.ts")) {
            return "diff --git a/src/old.ts b/src/renamed.ts\nsimilarity index 100%\nrename from src/old.ts\nrename to src/renamed.ts\n";
          }
        }
        if (arguments_[0] === "show") {
          switch (arguments_.at(-1)) {
            case `${MERGE_BASE}:README.md`:
              return "# Before\n";
            case `${HEAD}:README.md`:
              return "# After\n";
            case `${HEAD}:src/added.ts`:
              return "export const added = true;\n";
            case `${MERGE_BASE}:src/deleted.ts`:
              return "export const deleted = true;\n";
            case `${MERGE_BASE}:src/modified.ts`:
              return "export const oldValue = 1;\n";
            case `${HEAD}:src/modified.ts`:
              return "export const newValue = 2;\n";
            case `${MERGE_BASE}:src/old.ts`:
              return "export const renamed = true;\n";
            case `${HEAD}:src/renamed.ts`:
              return "export const renamed = true;\n";
            default:
              break;
          }
        }
        throw new Error(`Unexpected Git command: ${arguments_.join(" ")}`);
      })
    } satisfies GitCommandRunner;

    const result = await new FileSystemGitChangeSetProvider(runner).getRevisionHunks("C:/project", {
      baseRef: "origin/main",
      maxSourceFiles: 6
    });

    expect(result.changeSet).toEqual({
      requestedBaseRef: "origin/main",
      mergeBaseCommit: MERGE_BASE,
      headCommit: HEAD,
      includesUntracked: false,
      changes: [
        { kind: "modified", previousPath: "README.md", currentPath: "README.md", score: null },
        { kind: "added", previousPath: null, currentPath: "src/added.ts", score: null },
        { kind: "deleted", previousPath: "src/deleted.ts", currentPath: null, score: null },
        {
          kind: "modified",
          previousPath: "src/modified.ts",
          currentPath: "src/modified.ts",
          score: null
        },
        {
          kind: "renamed",
          previousPath: "src/old.ts",
          currentPath: "src/renamed.ts",
          score: 90
        }
      ],
      sourcePaths: [
        "README.md",
        "src/added.ts",
        "src/deleted.ts",
        "src/modified.ts",
        "src/old.ts",
        "src/renamed.ts"
      ]
    });
    expect(result.files).toEqual([
      {
        change: { kind: "modified", previousPath: "README.md", currentPath: "README.md", score: null },
        hunks: [{ oldRange: { start: 1, count: 1 }, newRange: { start: 1, count: 1 } }],
        previous: {
          revision: MERGE_BASE,
          filePath: "README.md",
          language: "markdown",
          availability: "available",
          sourceText: "# Before\n"
        },
        current: {
          revision: HEAD,
          filePath: "README.md",
          language: "markdown",
          availability: "available",
          sourceText: "# After\n"
        }
      },
      {
        change: { kind: "added", previousPath: null, currentPath: "src/added.ts", score: null },
        hunks: [{ oldRange: { start: 0, count: 0 }, newRange: { start: 1, count: 2 } }],
        previous: {
          revision: MERGE_BASE,
          filePath: null,
          language: null,
          availability: "absent"
        },
        current: {
          revision: HEAD,
          filePath: "src/added.ts",
          language: "typescript",
          availability: "available",
          sourceText: "export const added = true;\n"
        }
      },
      {
        change: { kind: "deleted", previousPath: "src/deleted.ts", currentPath: null, score: null },
        hunks: [{ oldRange: { start: 2, count: 2 }, newRange: { start: 0, count: 0 } }],
        previous: {
          revision: MERGE_BASE,
          filePath: "src/deleted.ts",
          language: "typescript",
          availability: "available",
          sourceText: "export const deleted = true;\n"
        },
        current: {
          revision: HEAD,
          filePath: null,
          language: null,
          availability: "absent"
        }
      },
      {
        change: {
          kind: "modified",
          previousPath: "src/modified.ts",
          currentPath: "src/modified.ts",
          score: null
        },
        hunks: [{ oldRange: { start: 4, count: 1 }, newRange: { start: 4, count: 1 } }],
        previous: {
          revision: MERGE_BASE,
          filePath: "src/modified.ts",
          language: "typescript",
          availability: "available",
          sourceText: "export const oldValue = 1;\n"
        },
        current: {
          revision: HEAD,
          filePath: "src/modified.ts",
          language: "typescript",
          availability: "available",
          sourceText: "export const newValue = 2;\n"
        }
      },
      {
        change: {
          kind: "renamed",
          previousPath: "src/old.ts",
          currentPath: "src/renamed.ts",
          score: 90
        },
        hunks: [],
        previous: {
          revision: MERGE_BASE,
          filePath: "src/old.ts",
          language: "typescript",
          availability: "available",
          sourceText: "export const renamed = true;\n"
        },
        current: {
          revision: HEAD,
          filePath: "src/renamed.ts",
          language: "typescript",
          availability: "available",
          sourceText: "export const renamed = true;\n"
        }
      }
    ]);

    const hunkCalls = calls.filter(
      (call) => call.arguments_[0] === "diff" && call.arguments_.includes("--unified=0")
    );
    expect(hunkCalls).toHaveLength(5);
    for (const call of hunkCalls) {
      expect(call.projectPath).toBe("C:/project");
      expect(call.arguments_).toEqual(
        expect.arrayContaining([
          "--unified=0",
          "--inter-hunk-context=0",
          "--diff-algorithm=myers",
          "--no-indent-heuristic",
          "--no-ext-diff",
          "--no-textconv",
          "--no-color",
          MERGE_BASE,
          HEAD
        ])
      );
      expect(call.arguments_.some((argument) => argument === "origin/main")).toBe(false);
      expect(call.arguments_.some((argument) => argument.startsWith(":(literal)"))).toBe(true);
    }
    const showCalls = calls.filter((call) => call.arguments_[0] === "show");
    expect(showCalls).toHaveLength(8);
    for (const call of showCalls) {
      expect(call.arguments_).toEqual(
        expect.arrayContaining(["--no-ext-diff", "--no-textconv", "--no-color", "--end-of-options"])
      );
      expect(call.arguments_.at(-1)).toMatch(new RegExp(`^(?:${MERGE_BASE}|${HEAD}):`));
      expect(call.arguments_.at(-1)).not.toContain("origin/main");
    }
  });

  it("maps project-relative paths to repository-relative revision blobs below the worktree root", async () => {
    const projectPath = "C:/project/src";
    const runner = {
      run: vi.fn(async (receivedProjectPath: string, arguments_: readonly string[]) => {
        expect(receivedProjectPath).toBe(projectPath);
        if (arguments_[0] === "rev-parse" && arguments_.includes("--show-prefix")) {
          return "src/\n";
        }
        if (arguments_[0] === "rev-parse" && arguments_.at(-1) === "HEAD^{commit}") {
          return `${HEAD}\n`;
        }
        if (arguments_[0] === "rev-parse" && arguments_.at(-1) === "origin/main^{commit}") {
          return `${BASE}\n`;
        }
        if (arguments_[0] === "merge-base") {
          return `${MERGE_BASE}\n`;
        }
        if (arguments_[0] === "diff" && arguments_.includes("--name-status")) {
          // `--relative` makes this path relative to C:/project/src.
          return "M\u0000application/errors.ts\u0000";
        }
        if (arguments_[0] === "diff" && arguments_.includes("--unified=0")) {
          return "@@ -1 +1 @@\n-export const before = true;\n+export const after = true;\n";
        }
        if (arguments_[0] === "show" && arguments_.at(-1) === `${MERGE_BASE}:src/application/errors.ts`) {
          return "export const before = true;\n";
        }
        if (arguments_[0] === "show" && arguments_.at(-1) === `${HEAD}:src/application/errors.ts`) {
          return "export const after = true;\n";
        }
        throw new Error(`Unexpected Git command: ${arguments_.join(" ")}`);
      })
    } satisfies GitCommandRunner;

    const result = await new FileSystemGitChangeSetProvider(runner).getRevisionHunks(projectPath, {
      baseRef: "origin/main",
      maxSourceFiles: 1
    });

    expect(result.files[0]).toMatchObject({
      change: {
        previousPath: "application/errors.ts",
        currentPath: "application/errors.ts"
      },
      previous: { filePath: "application/errors.ts", sourceText: "export const before = true;\n" },
      current: { filePath: "application/errors.ts", sourceText: "export const after = true;\n" }
    });
    expect(runner.run).toHaveBeenCalledWith(
      projectPath,
      expect.arrayContaining([`${MERGE_BASE}:src/application/errors.ts`])
    );
    expect(runner.run).toHaveBeenCalledWith(
      projectPath,
      expect.arrayContaining([`${HEAD}:src/application/errors.ts`])
    );
  });

  it("keeps both supported sides when TypeScript is renamed to Markdown", async () => {
    const runner = {
      run: vi.fn(async (_projectPath: string, arguments_: readonly string[]) => {
        if (arguments_[0] === "rev-parse" && arguments_.includes("--show-prefix")) {
          return "\n";
        }
        if (arguments_[0] === "rev-parse" && arguments_.at(-1) === "HEAD^{commit}") {
          return `${HEAD}\n`;
        }
        if (arguments_[0] === "rev-parse" && arguments_.at(-1) === "origin/main^{commit}") {
          return `${BASE}\n`;
        }
        if (arguments_[0] === "merge-base") {
          return `${MERGE_BASE}\n`;
        }
        if (arguments_[0] === "diff" && arguments_.includes("--name-status")) {
          return "R100\u0000src/old.ts\u0000docs/renamed.md\u0000";
        }
        if (arguments_[0] === "diff" && arguments_.includes("--unified=0")) {
          return "@@ -1 +1 @@\n-export const oldValue = 1;\n+new documentation\n";
        }
        if (arguments_[0] === "show" && arguments_.at(-1) === `${MERGE_BASE}:src/old.ts`) {
          return "export const oldValue = 1;\n";
        }
        if (arguments_[0] === "show" && arguments_.at(-1) === `${HEAD}:docs/renamed.md`) {
          return "new documentation\n";
        }
        throw new Error(`Unexpected Git command: ${arguments_.join(" ")}`);
      })
    } satisfies GitCommandRunner;

    const result = await new FileSystemGitChangeSetProvider(runner).getRevisionHunks("C:/project", {
      baseRef: "origin/main",
      maxSourceFiles: 2
    });

    expect(result.changeSet.sourcePaths).toEqual(["docs/renamed.md", "src/old.ts"]);
    expect(result.files).toMatchObject([
      {
        previous: {
          revision: MERGE_BASE,
          filePath: "src/old.ts",
          availability: "available"
        },
        current: {
          revision: HEAD,
          filePath: "docs/renamed.md",
          language: "markdown",
          availability: "available",
          sourceText: "new documentation\n"
        }
      }
    ]);
    expect(runner.run).toHaveBeenCalledWith(
      "C:/project",
      expect.arrayContaining([`${HEAD}:docs/renamed.md`])
    );
  });

  it("enforces the immutable source-path cap before reading patches or blobs", async () => {
    const runner = {
      run: vi.fn(async (_projectPath: string, arguments_: readonly string[]) => {
        if (arguments_[0] === "rev-parse" && arguments_.at(-1) === "HEAD^{commit}") {
          return `${HEAD}\n`;
        }
        if (arguments_[0] === "rev-parse" && arguments_.at(-1) === "origin/main^{commit}") {
          return `${BASE}\n`;
        }
        if (arguments_[0] === "merge-base") {
          return `${MERGE_BASE}\n`;
        }
        if (arguments_[0] === "diff" && arguments_.includes("--name-status")) {
          return "M\u0000src/one.ts\u0000M\u0000src/two.ts\u0000";
        }
        throw new Error(`Unexpected Git command: ${arguments_.join(" ")}`);
      })
    } satisfies GitCommandRunner;

    await expect(
      new FileSystemGitChangeSetProvider(runner).getRevisionHunks("C:/project", {
        baseRef: "origin/main",
        maxSourceFiles: 1
      })
    ).rejects.toMatchObject({ code: "GIT_CHANGE_SET_TOO_LARGE" });
    expect(
      runner.run.mock.calls.some(([, arguments_]) =>
        arguments_.includes("--unified=0") || arguments_[0] === "show"
      )
    ).toBe(false);
  });

  it("filters before the source-path cap and retains renames matched on either path side", async () => {
    const runner = {
      run: vi.fn(async (_projectPath: string, arguments_: readonly string[]) => {
        if (arguments_[0] === "rev-parse" && arguments_.at(-1) === "HEAD^{commit}") {
          return `${HEAD}\n`;
        }
        if (arguments_[0] === "rev-parse" && arguments_.at(-1) === "origin/main^{commit}") {
          return `${BASE}\n`;
        }
        if (arguments_[0] === "merge-base") {
          return `${MERGE_BASE}\n`;
        }
        if (arguments_[0] === "rev-parse" && arguments_.includes("--show-prefix")) {
          return "";
        }
        if (arguments_[0] === "diff" && arguments_.includes("--name-status")) {
          return (
            "M\u0000src2/too-many.ts\u0000" +
            "M\u0000src/kept.ts\u0000" +
            "R100\u0000legacy/renamed.ts\u0000src/moved.ts\u0000" +
            "R100\u0000src/old-side.ts\u0000legacy/moved-away.ts\u0000"
          );
        }
        if (arguments_[0] === "diff" && arguments_.includes("--unified=0")) {
          const pathspecs = arguments_.slice(arguments_.indexOf("--") + 1);
          expect(pathspecs).not.toContain(":(literal)src2/too-many.ts");
          return "@@ -1 +1 @@\n-export const before = 1;\n+export const after = 2;\n";
        }
        if (arguments_[0] === "show") {
          return "export const value = 1;\n";
        }
        throw new Error(`Unexpected Git command: ${arguments_.join(" ")}`);
      })
    } satisfies GitCommandRunner;

    const result = await new FileSystemGitChangeSetProvider(runner).getRevisionHunks("C:/project", {
      baseRef: "origin/main",
      maxSourceFiles: 5,
      pathPrefix: "src"
    });

    expect(result.changeSet.sourcePaths).toEqual([
      "legacy/moved-away.ts",
      "legacy/renamed.ts",
      "src/kept.ts",
      "src/moved.ts",
      "src/old-side.ts",
      "src2/too-many.ts"
    ]);
    expect(result.files.map((file) => file.change)).toEqual(expect.arrayContaining([
      { kind: "modified", previousPath: "src/kept.ts", currentPath: "src/kept.ts", score: null },
      {
        kind: "renamed",
        previousPath: "legacy/renamed.ts",
        currentPath: "src/moved.ts",
        score: 100
      },
      {
        kind: "renamed",
        previousPath: "src/old-side.ts",
        currentPath: "legacy/moved-away.ts",
        score: 100
      }
    ]));
    expect(result.files).toHaveLength(3);
  });

  it("maps unavailable Git reads and malformed hunk output to typed errors", async () => {
    const baseRunner = (patchOutput: string | Error) =>
      ({
        run: vi.fn(async (_projectPath: string, arguments_: readonly string[]) => {
          if (arguments_[0] === "rev-parse" && arguments_.includes("--show-prefix")) {
            return "\n";
          }
          if (arguments_[0] === "rev-parse" && arguments_.at(-1) === "HEAD^{commit}") {
            return `${HEAD}\n`;
          }
          if (arguments_[0] === "rev-parse" && arguments_.at(-1) === "origin/main^{commit}") {
            return `${BASE}\n`;
          }
          if (arguments_[0] === "merge-base") {
            return `${MERGE_BASE}\n`;
          }
          if (arguments_[0] === "diff" && arguments_.includes("--name-status")) {
            return "M\u0000src/example.ts\u0000";
          }
          if (arguments_[0] === "diff" && arguments_.includes("--unified=0")) {
            if (patchOutput instanceof Error) {
              throw patchOutput;
            }
            return patchOutput;
          }
          throw new Error(`Unexpected Git command: ${arguments_.join(" ")}`);
        })
      }) satisfies GitCommandRunner;

    await expect(
      new FileSystemGitChangeSetProvider(baseRunner(new Error("spawn git ENOENT"))).getRevisionHunks(
        "C:/project",
        { baseRef: "origin/main", maxSourceFiles: 1 }
      )
    ).rejects.toMatchObject({ code: "GIT_UNAVAILABLE" });

    await expect(
      new FileSystemGitChangeSetProvider(baseRunner("@@ -not-a-range +1 @@\n")).getRevisionHunks(
        "C:/project",
        { baseRef: "origin/main", maxSourceFiles: 1 }
      )
    ).rejects.toMatchObject({ code: "MALFORMED_GIT_OUTPUT" });
  });
});
