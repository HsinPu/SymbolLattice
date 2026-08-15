import { existsSync } from "node:fs";
import { dirname, posix, win32 } from "node:path";
import { fileURLToPath } from "node:url";

import { SYMBOL_LATTICE_VERSION } from "../version.js";

const RELEASE_REPOSITORY = "HsinPu/SymbolLattice";
const RELEASE_ENDPOINT = `https://api.github.com/repos/${RELEASE_REPOSITORY}/releases/latest`;
const TAGS_ENDPOINT = `https://api.github.com/repos/${RELEASE_REPOSITORY}/tags?per_page=100`;
const RELEASE_ENDPOINTS = [RELEASE_ENDPOINT, TAGS_ENDPOINT] as const;
const RELEASE_TIMEOUT_MS = 5_000;
const MAX_RELEASE_RESPONSE_BYTES = 64 * 1024;
const PACKAGE_NAME = "@hsinpu/symbol-lattice";
const RELEASE_DOWNLOAD_BASE = `https://github.com/${RELEASE_REPOSITORY}/releases/download`;

interface ParsedVersion {
  readonly canonical: string;
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease: readonly (number | string)[];
}

export type UpgradeInstallation =
  | { readonly kind: "source-checkout"; readonly root: string }
  | { readonly kind: "npm-local"; readonly root: string }
  | { readonly kind: "npm-global" }
  | { readonly kind: "npx" }
  | { readonly kind: "unknown"; readonly reason: string };

export interface UpgradeInstallationDetectionInput {
  readonly entryPath: string;
  readonly cwd: string;
  readonly platform: NodeJS.Platform;
  readonly exists?: (path: string) => boolean;
}

export interface UpgradePreviewOptions {
  /** A pinned target. When present, no release network request is made. */
  readonly version?: string;
  /** Render the same stable contract as a version check instead of an upgrade preview. */
  readonly check?: boolean;
}

export interface UpgradePreviewDependencies {
  readonly currentVersion?: string;
  readonly resolveLatestRelease?: () => Promise<string>;
  readonly installation?: UpgradeInstallation;
}

export interface UpgradeCommandStep {
  readonly command: string;
  readonly args: readonly string[];
}

export interface UpgradePreviewResult {
  readonly schemaVersion: 1;
  readonly mode: "check" | "preview";
  readonly status: "update-available" | "up-to-date" | "local-newer" | "downgrade-selected";
  readonly currentVersion: string;
  readonly targetVersion: string;
  readonly release: {
    readonly source: "explicit-version" | "github-catalog";
    readonly repository: typeof RELEASE_REPOSITORY;
    readonly endpoints: typeof RELEASE_ENDPOINTS;
    readonly networkRequested: boolean;
    readonly artifacts: {
      readonly tarball: string;
      readonly checksum: string;
      readonly manifest: string;
    };
  };
  readonly installation: UpgradeInstallation & {
    readonly steps: readonly UpgradeCommandStep[];
    readonly diagnostics: readonly string[];
  };
  readonly mutation: {
    readonly performed: false;
    readonly automaticApplySupported: boolean;
  };
  readonly notes: readonly string[];
}

/**
 * Compare two SemVer values. Build metadata is intentionally ignored, as
 * required by SemVer precedence rules.
 */
export function compareReleaseVersions(left: string, right: string): number {
  const a = parseReleaseVersion(left, "left version");
  const b = parseReleaseVersion(right, "right version");
  for (const key of ["major", "minor", "patch"] as const) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
  }
  if (a.prerelease.length === 0 || b.prerelease.length === 0) {
    if (a.prerelease.length === b.prerelease.length) return 0;
    return a.prerelease.length === 0 ? 1 : -1;
  }
  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftIdentifier = a.prerelease[index];
    const rightIdentifier = b.prerelease[index];
    if (leftIdentifier === undefined || rightIdentifier === undefined) {
      if (leftIdentifier === rightIdentifier) return 0;
      return leftIdentifier === undefined ? -1 : 1;
    }
    if (leftIdentifier === rightIdentifier) continue;
    if (typeof leftIdentifier === "number" && typeof rightIdentifier === "number") {
      return leftIdentifier < rightIdentifier ? -1 : 1;
    }
    if (typeof leftIdentifier === "number") return -1;
    if (typeof rightIdentifier === "number") return 1;
    return leftIdentifier < rightIdentifier ? -1 : 1;
  }
  return 0;
}

/** Detect only layouts that can be proven from the running module path. */
export function detectUpgradeInstallation(
  input: UpgradeInstallationDetectionInput
): UpgradeInstallation {
  const pathApi = input.platform === "win32" ? win32 : posix;
  const normalizedEntry = input.entryPath.replace(/\\/g, "/");
  const normalizedCwd = pathApi.resolve(input.cwd).replace(/\\/g, "/");
  if (normalizedEntry.includes("/_npx/")) return { kind: "npx" };
  if (normalizedEntry.includes("/node_modules/")) {
    if (normalizedEntry.startsWith(`${normalizedCwd}/`)) {
      return { kind: "npm-local", root: pathApi.resolve(input.cwd) };
    }
    return { kind: "npm-global" };
  }

  const root = pathApi.resolve(dirnameFor(pathApi, input.entryPath), "..", "..");
  const exists = input.exists ?? existsSync;
  if (exists(pathApi.join(root, "package.json")) && exists(pathApi.join(root, ".git"))) {
    return { kind: "source-checkout", root };
  }
  return {
    kind: "unknown",
    reason: `Unrecognized installation layout at ${input.entryPath}.`
  };
}

/**
 * Resolve the latest stable GitHub release only when this function is called.
 * There is no timer, cache, startup hook, telemetry, or background request.
 */
export async function resolveLatestGithubRelease(): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RELEASE_TIMEOUT_MS);
  timeout.unref?.();
  try {
    let releaseFailure = "latest release was unavailable";
    try {
      const payload = await fetchBoundedGithubJson(RELEASE_ENDPOINT, controller.signal);
      const release = payload as { tag_name?: unknown; draft?: unknown; prerelease?: unknown };
      if (release.draft === true || release.prerelease === true || typeof release.tag_name !== "string") {
        throw new Error("GitHub did not return a stable published release tag.");
      }
      const parsed = parseReleaseVersion(release.tag_name, "GitHub release tag");
      if (parsed.prerelease.length > 0) {
        throw new Error("GitHub returned a prerelease tag from the stable release endpoint.");
      }
      return parsed.canonical;
    } catch (error) {
      releaseFailure = error instanceof Error ? error.message : releaseFailure;
    }

    let tagsFailure = "repository tags were unavailable";
    try {
      const payload = await fetchBoundedGithubJson(TAGS_ENDPOINT, controller.signal);
      if (!Array.isArray(payload)) throw new Error("GitHub tags response was not an array.");
      const stableVersions: ParsedVersion[] = [];
      for (const item of payload) {
        const name = (item as { name?: unknown })?.name;
        if (typeof name !== "string") continue;
        try {
          const parsed = parseReleaseVersion(name, "GitHub repository tag");
          if (parsed.prerelease.length === 0) stableVersions.push(parsed);
        } catch {
          // Repository tags that are not releases are deliberately ignored.
        }
      }
      if (stableVersions.length === 0) {
        throw new Error("GitHub returned no stable semantic-version tags.");
      }
      stableVersions.sort((left, right) => compareReleaseVersions(right.canonical, left.canonical));
      return stableVersions[0]!.canonical;
    } catch (error) {
      tagsFailure = error instanceof Error ? error.message : tagsFailure;
    }
    throw new Error(
      `Unable to resolve the latest SymbolLattice release: ${releaseFailure} Tag fallback failed: ${tagsFailure}`
    );
  } finally {
    clearTimeout(timeout);
  }
}

/** Create a fully non-mutating check or upgrade plan. */
export async function createUpgradePreview(
  options: UpgradePreviewOptions,
  dependencies: UpgradePreviewDependencies = {}
): Promise<UpgradePreviewResult> {
  const current = parseReleaseVersion(
    dependencies.currentVersion ?? SYMBOL_LATTICE_VERSION,
    "current version"
  );
  const explicitVersion = options.version?.trim();
  const networkRequested = explicitVersion === undefined;
  const target = parseReleaseVersion(
    explicitVersion ?? await (dependencies.resolveLatestRelease ?? resolveLatestGithubRelease)(),
    networkRequested ? "version returned by the release source" : "explicit target (expected a valid semantic version)"
  );
  const comparison = compareReleaseVersions(current.canonical, target.canonical);
  const installation = dependencies.installation ?? detectUpgradeInstallation({
    entryPath: fileURLToPath(import.meta.url),
    cwd: process.cwd(),
    platform: process.platform
  });
  const artifacts = releaseArtifacts(target.canonical);
  const plan = buildInstallationPlan(installation, artifacts.tarball);
  const automaticApplySupported = installation.kind === "npm-local" || installation.kind === "npm-global";

  return {
    schemaVersion: 1,
    mode: options.check === true ? "check" : "preview",
    status: comparison < 0
      ? "update-available"
      : comparison > 0
        ? networkRequested ? "local-newer" : "downgrade-selected"
        : "up-to-date",
    currentVersion: current.canonical,
    targetVersion: target.canonical,
    release: {
      source: networkRequested ? "github-catalog" : "explicit-version",
      repository: RELEASE_REPOSITORY,
      endpoints: RELEASE_ENDPOINTS,
      networkRequested,
      artifacts
    },
    installation: { ...installation, ...plan },
    mutation: {
      performed: false,
      automaticApplySupported
    },
    notes: [
      "Preview and check modes never change the package, source checkout, project index, Agent configuration, or global state.",
      networkRequested
        ? "Network access occurred only because the upgrade command was explicitly invoked without a pinned version."
        : "The explicit target was validated locally; no release network request was made.",
      automaticApplySupported
        ? "Use --verify for a non-mutating evidence check, or --apply --yes to verify every release artifact and then install the verified local bytes."
        : "Automatic apply is unavailable for this installation layout; use --verify before reviewing the advisory steps."
    ]
  };
}

async function fetchBoundedGithubJson(endpoint: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "symbol-lattice-upgrade-preview",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    redirect: "error",
    signal
  });
  if (!response.ok) {
    throw new Error(`GitHub lookup failed with HTTP ${response.status}.`);
  }
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RELEASE_RESPONSE_BYTES) {
    throw new Error("GitHub response exceeded the accepted size limit.");
  }
  const text = await readBoundedResponseText(response);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("GitHub response was not valid JSON.");
  }
}

async function readBoundedResponseText(response: Response): Promise<string> {
  if (response.body === null) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_RELEASE_RESPONSE_BYTES) {
      void reader.cancel("SymbolLattice GitHub response size limit exceeded.").catch(() => undefined);
      throw new Error("GitHub response exceeded the accepted size limit.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), totalBytes).toString("utf8");
}

function releaseArtifacts(version: string): UpgradePreviewResult["release"]["artifacts"] {
  const filename = `hsinpu-symbol-lattice-${version}.tgz`;
  const base = `${RELEASE_DOWNLOAD_BASE}/v${version}/${filename}`;
  return {
    tarball: base,
    checksum: `${base}.sha256`,
    manifest: `${base}.manifest.json`
  };
}

function buildInstallationPlan(installation: UpgradeInstallation, tarballUrl: string): {
  readonly steps: readonly UpgradeCommandStep[];
  readonly diagnostics: readonly string[];
} {
  switch (installation.kind) {
    case "source-checkout":
      return {
        steps: [
          { command: "git", args: ["-C", installation.root, "pull", "--ff-only"] },
          { command: "npm", args: ["--prefix", installation.root, "ci"] },
          { command: "npm", args: ["--prefix", installation.root, "run", "build"] },
          { command: "node", args: [`${installation.root.replace(/[\\/]$/, "")}/dist/cli/main.js`, "--version"] }
        ],
        diagnostics: [
          "Source-checkout steps are advisory and are not executed.",
          "Review local changes and the upstream branch before running any step."
        ]
      };
    case "npm-local":
      return {
        steps: [
          { command: "npm", args: ["--prefix", installation.root, "install", tarballUrl] }
        ],
        diagnostics: [
          "The previewed command is executed only after --apply --yes verifies the tarball, checksum, manifest, and GitHub attestation."
        ]
      };
    case "npm-global":
      return {
        steps: [
          { command: "npm", args: ["install", "--global", tarballUrl] }
        ],
        diagnostics: [
          "The previewed command is executed only after --apply --yes verifies the tarball, checksum, manifest, and GitHub attestation."
        ]
      };
    case "npx":
      return {
        steps: [
          { command: "npx", args: ["--yes", "--package", tarballUrl, "symbol-lattice", "--version"] }
        ],
        diagnostics: [
          `The ${PACKAGE_NAME} registry package remains private; this command runs the immutable GitHub Release tarball without changing the current installation.`
        ]
      };
    case "unknown":
      return {
        steps: [],
        diagnostics: [installation.reason, "No upgrade command is guessed for an unrecognized layout."]
      };
  }
}

function dirnameFor(pathApi: typeof posix | typeof win32, value: string): string {
  return pathApi.dirname(value);
}

function parseReleaseVersion(value: string, label: string): ParsedVersion {
  const trimmed = value.trim();
  const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(trimmed);
  if (match === null) {
    throw new Error(`Invalid ${label}: expected a valid semantic version such as 1.2.3 or 1.2.3-rc.1.`);
  }
  const prereleaseText = match[4];
  const prerelease = prereleaseText === undefined
    ? []
    : prereleaseText.split(".").map((identifier) => /^\d+$/.test(identifier) ? Number(identifier) : identifier);
  const core = `${match[1]}.${match[2]}.${match[3]}`;
  return {
    canonical: `${core}${prereleaseText === undefined ? "" : `-${prereleaseText}`}${match[5] === undefined ? "" : `+${match[5]}`}`,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease
  };
}
