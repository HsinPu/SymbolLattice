export const MAXIMUM_PROJECT_PATH_UNREADABLE_EVIDENCE = 8 as const;

export interface ProjectPathUnreadableEvidence {
  /** Project-relative POSIX path; the project root is represented by `.`. */
  readonly path: string;
  readonly code: "EACCES" | "EPERM";
}

/**
 * A bounded, host-path-safe description of project inputs that could not be
 * read. Filesystem adapters collect sibling failures before throwing it.
 */
export class ProjectPathUnreadableError extends Error {
  public readonly code = "PROJECT_PATH_UNREADABLE" as const;
  public readonly evidence: readonly ProjectPathUnreadableEvidence[];
  public readonly total: number;
  public readonly truncated: boolean;

  public constructor(
    evidence: readonly ProjectPathUnreadableEvidence[],
    total = evidence.length
  ) {
    const byPath = new Map<string, ProjectPathUnreadableEvidence["code"]>();
    for (const item of evidence) {
      const path = safeProjectRelativePath(item.path);
      const previous = byPath.get(path);
      if (previous === undefined || item.code < previous) {
        byPath.set(path, item.code);
      }
    }
    const ordered = [...byPath.entries()]
      .sort(([leftPath, leftCode], [rightPath, rightCode]) => {
        if (leftPath !== rightPath) return leftPath < rightPath ? -1 : 1;
        return leftCode === rightCode ? 0 : leftCode < rightCode ? -1 : 1;
      })
      .map(([path, code]) => ({ path, code }));
    const normalizedTotal = Math.max(total, ordered.length);
    const bounded = ordered.slice(0, MAXIMUM_PROJECT_PATH_UNREADABLE_EVIDENCE);
    const omitted = Math.max(0, normalizedTotal - bounded.length);
    const details = bounded.map((item) => `${item.path} [${item.code}]`).join(", ");

    super(
      `Unable to read ${normalizedTotal} project path${normalizedTotal === 1 ? "" : "s"}: ` +
        `${details}${omitted === 0 ? "." : `; ${omitted} more not shown.`}`
    );
    this.name = "ProjectPathUnreadableError";
    this.evidence = bounded;
    this.total = normalizedTotal;
    this.truncated = omitted > 0;
  }
}

function safeProjectRelativePath(value: string): string {
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//u, "");
  if (
    normalized === "." ||
    (normalized.length > 0 &&
      !normalized.startsWith("/") &&
      !/^[A-Za-z]:/u.test(normalized) &&
      !normalized.split("/").some((segment) => segment === "" || segment === ".."))
  ) {
    return normalized;
  }
  return ".";
}
