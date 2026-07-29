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
      "R90\u0000src/old.ts\u0000src/new.ts\u0000M\u0000README.md\u0000D\u0000src/legacy.jsx\u0000A\u0000node_modules/example.ts\u0000"
    );

    expect(gitSourcePaths(changes)).toEqual(["src/legacy.jsx", "src/new.ts", "src/old.ts"]);
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
      sourcePaths: ["src/math.ts", "src/new.test.ts", "src/new.ts", "src/old.ts"]
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
