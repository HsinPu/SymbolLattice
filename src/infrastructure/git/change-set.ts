import { execFile } from "node:child_process";

import {
  GitChangeSetError,
  type GitChangeKind,
  type GitChangeRecord,
  type GitChangeSet,
  type GitChangeSetProvider,
  type GitChangeSetRequest
} from "../../ports/git-change-set.js";
import {
  HARD_EXCLUDED_DIRECTORY_NAMES,
  getSourceLanguage
} from "../filesystem/discovery.js";

const GIT_COMMAND_TIMEOUT_MS = 10_000;
const GIT_COMMAND_MAX_BUFFER_BYTES = 4 * 1024 * 1024;

export interface GitCommandRunner {
  run(projectPath: string, arguments_: readonly string[]): Promise<string>;
}

interface GitProcessError extends Error {
  readonly code?: string;
  readonly stderr?: string;
}

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function isSupportedSourcePath(filePath: string): boolean {
  return (
    getSourceLanguage(filePath) !== null &&
    !filePath.split("/").some((segment) => HARD_EXCLUDED_DIRECTORY_NAMES.has(segment))
  );
}

function malformed(message: string): GitChangeSetError {
  return new GitChangeSetError("MALFORMED_GIT_OUTPUT", message);
}

/**
 * Git -z output is byte-safe for whitespace and newline-bearing paths. The
 * adapter returns paths relative to the supplied project directory only.
 */
export function normalizeGitProjectPath(value: string): string {
  if (value.length === 0 || value.includes("\u0000")) {
    throw malformed("Git returned an empty or NUL-bearing path.");
  }

  // Git emits `/` as its path separator. A literal `\\` is valid in a POSIX
  // filename, so rewriting it would target a different project-relative path.
  const normalized = value;
  if (normalized.startsWith("/") || /^[A-Za-z]:\//u.test(normalized)) {
    throw malformed(`Git returned a non-project-relative path: ${value}`);
  }

  const segments = normalized.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    throw malformed(`Git returned an unsafe project-relative path: ${value}`);
  }

  return normalized;
}

function nullDelimitedFields(output: string): string[] {
  if (output.length === 0) {
    return [];
  }
  if (!output.endsWith("\u0000")) {
    throw malformed("Expected NUL-terminated Git output.");
  }
  return output.slice(0, -1).split("\u0000");
}

function changeKind(status: string): GitChangeKind {
  switch (status[0]) {
    case "A":
      return "added";
    case "M":
      return "modified";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "C":
      return "copied";
    case "T":
      return "type-changed";
    case "U":
      return "unmerged";
    default:
      return "unknown";
  }
}

function scoreFromStatus(status: string): number | null {
  if (!/^[RC]\d{1,3}$/u.test(status)) {
    return null;
  }
  const score = Number(status.slice(1));
  if (!Number.isSafeInteger(score) || score < 0 || score > 100) {
    throw malformed(`Git returned an invalid rename/copy score: ${status}`);
  }
  return score;
}

function compareChangeRecords(left: GitChangeRecord, right: GitChangeRecord): number {
  return (
    compareText(left.currentPath ?? left.previousPath ?? "", right.currentPath ?? right.previousPath ?? "") ||
    compareText(left.previousPath ?? "", right.previousPath ?? "") ||
    compareText(left.kind, right.kind) ||
    (left.score ?? -1) - (right.score ?? -1)
  );
}

/** Parses `git diff --name-status -z` records without relying on shell quoting. */
export function parseGitNameStatusZ(output: string): readonly GitChangeRecord[] {
  const fields = nullDelimitedFields(output);
  const changes: GitChangeRecord[] = [];
  let index = 0;

  while (index < fields.length) {
    const status = fields[index];
    index += 1;
    const hasValidStatus =
      status !== undefined &&
      ((status !== "R" && status !== "C" && /^[A-Z]$/u.test(status)) || /^[RC]\d{1,3}$/u.test(status));
    if (!hasValidStatus) {
      throw malformed(`Git returned an invalid name-status record: ${status ?? "<missing>"}`);
    }

    const kind = changeKind(status);
    const score = scoreFromStatus(status);
    if (kind === "renamed" || kind === "copied") {
      const previous = fields[index];
      const current = fields[index + 1];
      index += 2;
      if (previous === undefined || current === undefined) {
        throw malformed(`Git ${kind} record is missing one of its paths.`);
      }
      changes.push({
        kind,
        previousPath: normalizeGitProjectPath(previous),
        currentPath: normalizeGitProjectPath(current),
        score
      });
      continue;
    }

    const path = fields[index];
    index += 1;
    if (path === undefined) {
      throw malformed(`Git ${kind} record is missing its path.`);
    }
    const normalizedPath = normalizeGitProjectPath(path);
    changes.push({
      kind,
      previousPath: kind === "added" ? null : normalizedPath,
      currentPath: kind === "deleted" ? null : normalizedPath,
      score: null
    });
  }

  return changes.sort(compareChangeRecords);
}

/** Parses NUL-separated Git paths such as `git ls-files --others -z`. */
export function parseGitPathsZ(output: string): readonly string[] {
  return [...new Set(nullDelimitedFields(output).map(normalizeGitProjectPath))].sort(compareText);
}

/** Selects deterministic source candidates while preserving all Git records separately. */
export function gitSourcePaths(changes: readonly GitChangeRecord[]): readonly string[] {
  return [
    ...new Set(
      changes
        .flatMap((change) => [change.previousPath, change.currentPath])
        .filter((filePath): filePath is string => filePath !== null && isSupportedSourcePath(filePath))
    )
  ].sort(compareText);
}

function revisionsFromOutput(output: string, label: string): string {
  const revision = output.trim();
  if (!/^[0-9a-f]{40,64}$/iu.test(revision)) {
    throw malformed(`Git returned an invalid ${label} revision.`);
  }
  return revision.toLowerCase();
}

async function runGitCommand(
  projectPath: string,
  arguments_: readonly string[]
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      ["-C", projectPath, "--no-pager", ...arguments_],
      {
        encoding: "utf8",
        timeout: GIT_COMMAND_TIMEOUT_MS,
        maxBuffer: GIT_COMMAND_MAX_BUFFER_BYTES,
        windowsHide: true
      },
      (error, stdout, stderr) => {
        if (error !== null) {
          const processError = error as GitProcessError;
          if (stderr.length > 0) {
            Object.defineProperty(processError, "stderr", {
              configurable: true,
              value: stderr
            });
          }
          reject(processError);
          return;
        }
        resolve(stdout);
      }
    );
  });
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    const stderr = (error as GitProcessError).stderr;
    return stderr === undefined || stderr.trim().length === 0
      ? error.message
      : stderr.trim();
  }
  return String(error);
}

function unavailable(error: unknown): GitChangeSetError {
  const message = errorMessage(error);
  return new GitChangeSetError("GIT_UNAVAILABLE", message);
}

function invalidBase(error: unknown): GitChangeSetError {
  const message = errorMessage(error);
  return new GitChangeSetError("INVALID_GIT_BASE", message);
}

function validateBaseRef(baseRef: string): void {
  if (
    baseRef.length === 0 ||
    baseRef !== baseRef.trim() ||
    baseRef.startsWith("-") ||
    /[\u0000-\u001F\u007F\s]/u.test(baseRef)
  ) {
    throw new GitChangeSetError(
      "INVALID_GIT_BASE",
      'Git base ref must be non-empty, contain no whitespace or control characters, and not begin with "-".'
    );
  }
}

/**
 * Read-only native Git adapter. Every command uses `execFile` with an argv
 * array, disables external diff/textconv hooks, and remains local to the
 * selected project directory.
 */
export class FileSystemGitChangeSetProvider implements GitChangeSetProvider {
  public constructor(private readonly runner: GitCommandRunner = { run: runGitCommand }) {}

  public async getChangeSet(
    projectPath: string,
    request: GitChangeSetRequest
  ): Promise<GitChangeSet> {
    const headCommit = await this.resolveRevision(projectPath, "HEAD^{commit}", "HEAD", false);
    if (request.mode === "working-tree") {
      const changes = await this.workingTreeChanges(projectPath, headCommit);
      return {
        requestedBaseRef: null,
        mergeBaseCommit: null,
        headCommit,
        includesUntracked: true,
        changes,
        sourcePaths: gitSourcePaths(changes)
      };
    }

    validateBaseRef(request.baseRef);
    const requestedBaseCommit = await this.resolveRevision(
      projectPath,
      `${request.baseRef}^{commit}`,
      request.baseRef,
      true
    );
    const mergeBaseCommit = await this.resolveMergeBase(projectPath, requestedBaseCommit, headCommit);
    const changes = await this.baseChanges(projectPath, mergeBaseCommit, headCommit);
    return {
      requestedBaseRef: request.baseRef,
      mergeBaseCommit,
      headCommit,
      includesUntracked: false,
      changes,
      sourcePaths: gitSourcePaths(changes)
    };
  }

  private async resolveRevision(
    projectPath: string,
    revision: string,
    label: string,
    isBase: boolean
  ): Promise<string> {
    try {
      return revisionsFromOutput(
        await this.runner.run(projectPath, [
          "rev-parse",
          "--verify",
          "--quiet",
          "--end-of-options",
          revision
        ]),
        label
      );
    } catch (error) {
      if (error instanceof GitChangeSetError) {
        throw error;
      }
      throw isBase ? invalidBase(error) : unavailable(error);
    }
  }

  private async resolveMergeBase(
    projectPath: string,
    baseCommit: string,
    headCommit: string
  ): Promise<string> {
    try {
      return revisionsFromOutput(
        await this.runner.run(projectPath, ["merge-base", baseCommit, headCommit]),
        "merge-base"
      );
    } catch (error) {
      if (error instanceof GitChangeSetError) {
        throw error;
      }
      throw invalidBase(error);
    }
  }

  private async baseChanges(
    projectPath: string,
    mergeBaseCommit: string,
    headCommit: string
  ): Promise<readonly GitChangeRecord[]> {
    try {
      return parseGitNameStatusZ(
        await this.runner.run(projectPath, [
          "diff",
          "--name-status",
          "-z",
          "--relative",
          "--find-renames",
          "--find-copies",
          "--no-ext-diff",
          "--no-textconv",
          "--no-color",
          mergeBaseCommit,
          headCommit,
          "--"
        ])
      );
    } catch (error) {
      if (error instanceof GitChangeSetError) {
        throw error;
      }
      throw unavailable(error);
    }
  }

  private async workingTreeChanges(
    projectPath: string,
    headCommit: string
  ): Promise<readonly GitChangeRecord[]> {
    let trackedChanges: readonly GitChangeRecord[];
    let untrackedPaths: readonly string[];
    try {
      [trackedChanges, untrackedPaths] = await Promise.all([
        this.runner
          .run(projectPath, [
            "diff",
            "--name-status",
            "-z",
            "--relative",
            "--find-renames",
            "--find-copies",
            "--no-ext-diff",
            "--no-textconv",
            "--no-color",
            headCommit,
            "--"
          ])
          .then(parseGitNameStatusZ),
        this.runner
          .run(projectPath, ["ls-files", "--others", "--exclude-standard", "-z"])
          .then(parseGitPathsZ)
      ]);
    } catch (error) {
      if (error instanceof GitChangeSetError) {
        throw error;
      }
      throw unavailable(error);
    }

    // An untracked path can legitimately equal the old side of a tracked
    // deletion or rename. Only a tracked destination suppresses the synthetic
    // untracked add; otherwise retain both provenance records.
    const trackedCurrentPaths = new Set(
      trackedChanges
        .map((change) => change.currentPath)
        .filter((path): path is string => path !== null)
    );
    const untrackedChanges = untrackedPaths
      .filter((path) => !trackedCurrentPaths.has(path))
      .map<GitChangeRecord>((path) => ({
        kind: "added",
        previousPath: null,
        currentPath: path,
        score: null
      }));
    return [...trackedChanges, ...untrackedChanges].sort(compareChangeRecords);
  }
}
