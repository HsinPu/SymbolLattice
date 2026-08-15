import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
  createUpgradePreview,
  type UpgradeInstallation,
  type UpgradePreviewDependencies,
  type UpgradePreviewOptions,
  type UpgradePreviewResult
} from "./upgrade.js";

const PACKAGE_NAME = "@hsinpu/symbol-lattice";
const RELEASE_REPOSITORY = "HsinPu/SymbolLattice";
const RELEASE_REPOSITORY_URL = `https://github.com/${RELEASE_REPOSITORY}`;
const ATTESTATIONS_ENDPOINT = `https://api.github.com/repos/${RELEASE_REPOSITORY}/attestations`;
const MAX_TARBALL_BYTES = 32 * 1024 * 1024;
const MAX_CHECKSUM_BYTES = 4 * 1024;
const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_ATTESTATION_BYTES = 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 30_000;
const INSTALL_TIMEOUT_MS = 10 * 60_000;
const PROCESS_OUTPUT_BYTES = 1024 * 1024;
const ALLOWED_DOWNLOAD_HOSTS = new Set([
  "github.com",
  "release-assets.githubusercontent.com",
  "objects.githubusercontent.com"
]);

const execFileAsync = promisify(execFile);

export interface UpgradeCommandOptions extends UpgradePreviewOptions {
  readonly verify?: boolean;
  readonly apply?: boolean;
  readonly yes?: boolean;
  readonly force?: boolean;
  readonly allowDowngrade?: boolean;
}

export interface UpgradeVerificationEvidence {
  readonly verified: true;
  readonly artifact: {
    readonly filename: string;
    readonly sizeBytes: number;
    readonly sha256: string;
  };
  readonly manifest: {
    readonly schemaVersion: 1;
    readonly packageName: typeof PACKAGE_NAME;
    readonly packageVersion: string;
    readonly releaseTag: string;
    readonly releaseCommit: string;
    readonly repository: typeof RELEASE_REPOSITORY;
  };
  readonly attestation: {
    readonly source: "github-artifact-attestations-api";
    readonly endpoint: string;
    readonly workflowInvocationId: string;
  };
}

export interface VerifiedUpgradeRelease {
  readonly evidence: UpgradeVerificationEvidence;
  readonly tarball: Uint8Array;
}

export interface UpgradeVerificationResult {
  readonly schemaVersion: 1;
  readonly mode: "verify";
  readonly status: "verified";
  readonly preview: UpgradePreviewResult;
  readonly verification: UpgradeVerificationEvidence;
  readonly mutation: {
    readonly performed: false;
    readonly automaticApplySupported: boolean;
  };
}

export interface UpgradeApplyResult {
  readonly schemaVersion: 1;
  readonly mode: "apply";
  readonly status: "applied" | "already-current";
  readonly preview: UpgradePreviewResult;
  readonly verification: UpgradeVerificationEvidence | null;
  readonly installation: {
    readonly kind: "npm-local" | "npm-global";
    readonly reportedVersion: string;
    readonly command: {
      readonly executable: "npm";
      readonly args: readonly string[];
    };
  } | null;
  readonly mutation: {
    readonly performed: boolean;
    readonly automaticApplySupported: boolean;
    readonly confirmed: true;
  };
}

export type UpgradeCommandResult = UpgradePreviewResult | UpgradeVerificationResult | UpgradeApplyResult;

export interface UpgradeExecutionDependencies extends UpgradePreviewDependencies {
  readonly createPreview?: (
    options: UpgradePreviewOptions,
    dependencies?: UpgradePreviewDependencies
  ) => Promise<UpgradePreviewResult>;
  readonly verifyRelease?: (preview: UpgradePreviewResult) => Promise<VerifiedUpgradeRelease>;
  readonly installRelease?: (
    installation: Extract<UpgradeInstallation, { readonly kind: "npm-local" | "npm-global" }>,
    targetVersion: string,
    release: VerifiedUpgradeRelease
  ) => Promise<NonNullable<UpgradeApplyResult["installation"]>>;
}

interface ReleaseManifest {
  readonly schemaVersion?: unknown;
  readonly package?: {
    readonly name?: unknown;
    readonly version?: unknown;
    readonly private?: unknown;
  };
  readonly release?: {
    readonly tag?: unknown;
    readonly commit?: unknown;
    readonly repository?: unknown;
    readonly channel?: unknown;
  };
  readonly artifact?: {
    readonly filename?: unknown;
    readonly sizeBytes?: unknown;
    readonly sha256?: unknown;
    readonly checksumFilename?: unknown;
  };
  readonly installation?: {
    readonly npmRegistryPublished?: unknown;
    readonly requiresNode?: unknown;
  };
}

/**
 * Runs preview, verification, or an explicitly confirmed npm upgrade. The
 * mutation path is unavailable until every published release artifact and its
 * GitHub-hosted provenance agree on version, tag, commit, size, and SHA256.
 */
export async function runUpgradeCommand(
  options: UpgradeCommandOptions,
  dependencies: UpgradeExecutionDependencies = {}
): Promise<UpgradeCommandResult> {
  validateUpgradeModes(options);
  const previewDependencies = previewDependenciesFrom(dependencies);
  const preview = await (dependencies.createPreview ?? createUpgradePreview)(options, previewDependencies);

  if (options.verify !== true && options.apply !== true) return preview;

  const automaticApplySupported = supportsAutomaticApply(preview.installation);
  if (options.apply === true) {
    if (options.yes !== true) {
      throw new Error("Refusing to apply an upgrade without the explicit --yes confirmation.");
    }
    requireApplicableInstallation(preview.installation);
    requireApplicableVersion(preview, options);
    if (preview.status === "up-to-date" && options.force !== true) {
      return {
        schemaVersion: 1,
        mode: "apply",
        status: "already-current",
        preview,
        verification: null,
        installation: null,
        mutation: {
          performed: false,
          automaticApplySupported: true,
          confirmed: true
        }
      };
    }
  }

  const verified = await (dependencies.verifyRelease ?? downloadAndVerifyUpgradeRelease)(preview);
  if (options.verify === true) {
    return {
      schemaVersion: 1,
      mode: "verify",
      status: "verified",
      preview,
      verification: verified.evidence,
      mutation: {
        performed: false,
        automaticApplySupported
      }
    };
  }

  const installation = requireApplicableInstallation(preview.installation);
  const installed = await (dependencies.installRelease ?? installVerifiedUpgradeRelease)(
    installation,
    preview.targetVersion,
    verified
  );
  return {
    schemaVersion: 1,
    mode: "apply",
    status: "applied",
    preview,
    verification: verified.evidence,
    installation: installed,
    mutation: {
      performed: true,
      automaticApplySupported: true,
      confirmed: true
    }
  };
}

/** Download and verify all immutable GitHub Release evidence before installation. */
export async function downloadAndVerifyUpgradeRelease(
  preview: UpgradePreviewResult,
  fetchImplementation: typeof fetch = fetch
): Promise<VerifiedUpgradeRelease> {
  const [tarball, checksum, manifest] = await Promise.all([
    fetchBoundedAsset(preview.release.artifacts.tarball, MAX_TARBALL_BYTES, fetchImplementation),
    fetchBoundedAsset(preview.release.artifacts.checksum, MAX_CHECKSUM_BYTES, fetchImplementation),
    fetchBoundedAsset(preview.release.artifacts.manifest, MAX_MANIFEST_BYTES, fetchImplementation)
  ]);
  const sha256 = createHash("sha256").update(tarball).digest("hex");
  const attestationEndpoint = `${ATTESTATIONS_ENDPOINT}/sha256:${sha256}`;
  const attestation = await fetchBoundedAsset(
    attestationEndpoint,
    MAX_ATTESTATION_BYTES,
    fetchImplementation,
    new Set(["api.github.com"])
  );
  const evidence = verifyDownloadedUpgradeRelease({
    targetVersion: preview.targetVersion,
    tarballUrl: preview.release.artifacts.tarball,
    tarball,
    checksumText: Buffer.from(checksum).toString("utf8"),
    manifestText: Buffer.from(manifest).toString("utf8"),
    attestationPayload: parseJson(attestation, "GitHub attestation response"),
    attestationEndpoint
  });
  return { evidence, tarball };
}

/** Pure integrity/provenance verifier used by both the network path and tests. */
export function verifyDownloadedUpgradeRelease(input: {
  readonly targetVersion: string;
  readonly tarballUrl: string;
  readonly tarball: Uint8Array;
  readonly checksumText: string;
  readonly manifestText: string;
  readonly attestationPayload: unknown;
  readonly attestationEndpoint: string;
}): UpgradeVerificationEvidence {
  const filename = basename(new URL(input.tarballUrl).pathname);
  const expectedFilename = `hsinpu-symbol-lattice-${input.targetVersion}.tgz`;
  if (filename !== expectedFilename) {
    throw new Error(`Release tarball filename mismatch: expected ${expectedFilename}.`);
  }
  const sha256 = createHash("sha256").update(input.tarball).digest("hex");
  const checksumMatch = /^([0-9a-f]{64})  ([^\r\n]+)\r?\n?$/.exec(input.checksumText);
  if (checksumMatch === null || checksumMatch[1] !== sha256 || checksumMatch[2] !== filename) {
    throw new Error("Release checksum does not exactly match the downloaded tarball.");
  }

  const manifest = parseJson(Buffer.from(input.manifestText), "release manifest") as ReleaseManifest;
  validateManifest(manifest, input.targetVersion, filename, input.tarball.byteLength, sha256);
  const releaseCommit = manifest.release!.commit as string;
  const workflowInvocationId = verifyGithubAttestation(
    input.attestationPayload,
    filename,
    sha256,
    input.targetVersion,
    releaseCommit
  );

  return {
    verified: true,
    artifact: {
      filename,
      sizeBytes: input.tarball.byteLength,
      sha256
    },
    manifest: {
      schemaVersion: 1,
      packageName: PACKAGE_NAME,
      packageVersion: input.targetVersion,
      releaseTag: `v${input.targetVersion}`,
      releaseCommit,
      repository: RELEASE_REPOSITORY
    },
    attestation: {
      source: "github-artifact-attestations-api",
      endpoint: input.attestationEndpoint,
      workflowInvocationId
    }
  };
}

/** Install only the already-verified local bytes, then prove the new CLI version. */
export async function installVerifiedUpgradeRelease(
  installation: Extract<UpgradeInstallation, { readonly kind: "npm-local" | "npm-global" }>,
  targetVersion: string,
  release: VerifiedUpgradeRelease
): Promise<NonNullable<UpgradeApplyResult["installation"]>> {
  const stagingDirectory = await mkdtemp(join(tmpdir(), "symbol-lattice-upgrade-"));
  const tarballPath = join(stagingDirectory, release.evidence.artifact.filename);
  try {
    await writeFile(tarballPath, release.tarball, { flag: "wx", mode: 0o600 });
    const args = installation.kind === "npm-global"
      ? ["install", "--global", tarballPath, "--no-audit", "--no-fund"]
      : ["--prefix", installation.root, "install", "--no-save", tarballPath, "--no-audit", "--no-fund"];
    await runNpm(args);

    const entryPath = fileURLToPath(import.meta.url).replace(/upgrade-apply\.js$/, "main.js");
    const probe = await runProcess(process.execPath, [entryPath, "--version"]);
    const reportedVersion = lastNonEmptyLine(probe.stdout);
    if (reportedVersion !== targetVersion) {
      throw new Error(
        `Upgrade command completed, but the installed CLI reports ${reportedVersion || "no version"} instead of ${targetVersion}.`
      );
    }
    return {
      kind: installation.kind,
      reportedVersion,
      command: { executable: "npm", args }
    };
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true });
  }
}

function validateUpgradeModes(options: UpgradeCommandOptions): void {
  if (options.verify === true && options.apply === true) {
    throw new Error("Choose either --verify or --apply, not both.");
  }
  if (options.check === true && (options.verify === true || options.apply === true)) {
    throw new Error("--check cannot be combined with --verify or --apply.");
  }
  if (options.yes === true && options.apply !== true) {
    throw new Error("--yes is accepted only together with --apply.");
  }
  if (options.allowDowngrade === true && options.apply !== true) {
    throw new Error("--allow-downgrade is accepted only together with --apply.");
  }
  if (options.force === true && options.apply !== true) {
    throw new Error("--force is accepted only together with --apply.");
  }
}

function requireApplicableVersion(preview: UpgradePreviewResult, options: UpgradeCommandOptions): void {
  if (preview.status === "local-newer") {
    throw new Error("The published catalog is older than this installation; pin a version and explicitly allow a downgrade.");
  }
  if (preview.status === "downgrade-selected" && options.allowDowngrade !== true) {
    throw new Error("Refusing to downgrade without the explicit --allow-downgrade flag.");
  }
}

function supportsAutomaticApply(installation: UpgradeInstallation): boolean {
  return installation.kind === "npm-local" || installation.kind === "npm-global";
}

function requireApplicableInstallation(
  installation: UpgradeInstallation
): Extract<UpgradeInstallation, { readonly kind: "npm-local" | "npm-global" }> {
  if (installation.kind === "npm-local" || installation.kind === "npm-global") return installation;
  switch (installation.kind) {
    case "source-checkout":
      throw new Error("Automatic apply is unavailable for a source checkout; review and run the previewed Git steps manually.");
    case "npx":
      throw new Error("Automatic apply is unavailable for npx, which creates an ephemeral installation per invocation.");
    case "unknown":
      throw new Error(`Automatic apply is unavailable: ${installation.reason}`);
  }
}

function previewDependenciesFrom(dependencies: UpgradeExecutionDependencies): UpgradePreviewDependencies {
  return {
    ...(dependencies.currentVersion === undefined ? {} : { currentVersion: dependencies.currentVersion }),
    ...(dependencies.resolveLatestRelease === undefined
      ? {}
      : { resolveLatestRelease: dependencies.resolveLatestRelease }),
    ...(dependencies.installation === undefined ? {} : { installation: dependencies.installation })
  };
}

async function fetchBoundedAsset(
  endpoint: string,
  maximumBytes: number,
  fetchImplementation: typeof fetch,
  allowedHosts: ReadonlySet<string> = ALLOWED_DOWNLOAD_HOSTS
): Promise<Uint8Array> {
  const requestedUrl = new URL(endpoint);
  if (requestedUrl.protocol !== "https:" || !allowedHosts.has(requestedUrl.hostname)) {
    throw new Error(`Refusing an untrusted release asset URL: ${endpoint}`);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  timeout.unref?.();
  try {
    const response = await fetchImplementation(endpoint, {
      headers: {
        Accept: "application/octet-stream, application/json",
        "User-Agent": "symbol-lattice-upgrade-verifier",
        "X-GitHub-Api-Version": "2022-11-28"
      },
      redirect: "follow",
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Release evidence download failed with HTTP ${response.status}.`);
    if (response.url.length > 0) {
      const finalUrl = new URL(response.url);
      if (finalUrl.protocol !== "https:" || !allowedHosts.has(finalUrl.hostname)) {
        throw new Error(`Release download redirected to an untrusted host: ${finalUrl.hostname}`);
      }
    }
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
      throw new Error(`Release evidence exceeded the ${maximumBytes}-byte limit.`);
    }
    return await readBoundedBytes(response, maximumBytes);
  } finally {
    clearTimeout(timeout);
  }
}

async function readBoundedBytes(response: Response, maximumBytes: number): Promise<Uint8Array> {
  if (response.body === null) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maximumBytes) {
      void reader.cancel("SymbolLattice release evidence size limit exceeded.").catch(() => undefined);
      throw new Error(`Release evidence exceeded the ${maximumBytes}-byte limit.`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), totalBytes);
}

function validateManifest(
  manifest: ReleaseManifest,
  targetVersion: string,
  filename: string,
  sizeBytes: number,
  sha256: string
): void {
  if (
    manifest.schemaVersion !== 1 ||
    manifest.package?.name !== PACKAGE_NAME ||
    manifest.package.version !== targetVersion ||
    manifest.package.private !== true ||
    manifest.release?.tag !== `v${targetVersion}` ||
    typeof manifest.release.commit !== "string" ||
    !/^[0-9a-f]{40}$/.test(manifest.release.commit) ||
    manifest.release.repository !== RELEASE_REPOSITORY ||
    manifest.release.channel !== "github-release-tarball" ||
    manifest.artifact?.filename !== filename ||
    manifest.artifact.sizeBytes !== sizeBytes ||
    manifest.artifact.sha256 !== sha256 ||
    manifest.artifact.checksumFilename !== `${filename}.sha256` ||
    manifest.installation?.npmRegistryPublished !== false ||
    typeof manifest.installation.requiresNode !== "string"
  ) {
    throw new Error("Release manifest does not match the selected package, version, artifact, or release contract.");
  }
}

function verifyGithubAttestation(
  payload: unknown,
  filename: string,
  sha256: string,
  targetVersion: string,
  releaseCommit: string
): string {
  const attestations = isRecord(payload) && Array.isArray(payload.attestations)
    ? payload.attestations
    : [];
  for (const item of attestations) {
    if (!isRecord(item) || !isRecord(item.bundle) || !isRecord(item.bundle.dsseEnvelope)) continue;
    const encodedPayload = item.bundle.dsseEnvelope.payload;
    if (typeof encodedPayload !== "string") continue;
    let statement: unknown;
    try {
      statement = JSON.parse(Buffer.from(encodedPayload, "base64").toString("utf8"));
    } catch {
      continue;
    }
    if (
      !isRecord(statement) ||
      statement._type !== "https://in-toto.io/Statement/v1" ||
      statement.predicateType !== "https://slsa.dev/provenance/v1" ||
      !Array.isArray(statement.subject) ||
      !isRecord(statement.predicate)
    ) continue;
    const subjectMatches = statement.subject.some((subject) =>
      isRecord(subject) &&
      subject.name === filename &&
      isRecord(subject.digest) &&
      subject.digest.sha256 === sha256
    );
    if (!subjectMatches) continue;
    const buildDefinition = isRecord(statement.predicate.buildDefinition)
      ? statement.predicate.buildDefinition
      : undefined;
    const externalParameters = buildDefinition !== undefined && isRecord(buildDefinition.externalParameters)
      ? buildDefinition.externalParameters
      : undefined;
    const workflow = externalParameters !== undefined && isRecord(externalParameters.workflow)
      ? externalParameters.workflow
      : undefined;
    const resolvedDependencies = buildDefinition !== undefined && Array.isArray(buildDefinition.resolvedDependencies)
      ? buildDefinition.resolvedDependencies
      : [];
    const commitMatches = resolvedDependencies.some((dependency) =>
      isRecord(dependency) &&
      isRecord(dependency.digest) &&
      dependency.digest.gitCommit === releaseCommit
    );
    if (
      workflow?.repository !== RELEASE_REPOSITORY_URL ||
      workflow.ref !== `refs/tags/v${targetVersion}` ||
      !commitMatches
    ) continue;
    const runDetails = isRecord(statement.predicate.runDetails) ? statement.predicate.runDetails : undefined;
    const metadata = runDetails !== undefined && isRecord(runDetails.metadata) ? runDetails.metadata : undefined;
    if (typeof metadata?.invocationId === "string" && metadata.invocationId.length > 0) {
      return metadata.invocationId;
    }
  }
  throw new Error("GitHub did not return matching provenance for the selected tarball, tag, and commit.");
}

async function runNpm(args: readonly string[]): Promise<void> {
  if (process.platform === "win32") {
    const invocation = windowsNpmInvocation(args);
    await runProcess(invocation.command, invocation.args);
    return;
  }
  await runProcess("npm", args);
}

/** Resolve npm's JavaScript entrypoint and bypass cmd.exe quoting entirely. */
export function windowsNpmInvocation(
  args: readonly string[],
  input: {
    readonly nodeExecutable?: string;
    readonly npmExecPath?: string;
    readonly exists?: (path: string) => boolean;
  } = {}
): { readonly command: string; readonly args: readonly string[] } {
  const nodeExecutable = input.nodeExecutable ?? process.execPath;
  const candidates = [
    ...(input.npmExecPath === undefined ? [] : [input.npmExecPath]),
    join(dirname(nodeExecutable), "node_modules", "npm", "bin", "npm-cli.js")
  ];
  const exists = input.exists ?? existsSync;
  const npmCli = candidates.find((candidate) => /npm-cli\.js$/i.test(candidate) && exists(candidate));
  if (npmCli === undefined) {
    throw new Error(
      "Unable to locate npm-cli.js safely on Windows; refusing to invoke npm through a shell."
    );
  }
  return { command: nodeExecutable, args: [npmCli, ...args] };
}

async function runProcess(command: string, args: readonly string[]): Promise<{ stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync(command, [...args], {
      encoding: "utf8",
      env: {
        ...process.env,
        NO_COLOR: "1",
        npm_config_audit: "false",
        npm_config_fund: "false"
      },
      maxBuffer: PROCESS_OUTPUT_BYTES,
      timeout: INSTALL_TIMEOUT_MS,
      windowsHide: true
    });
    return { stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const failure = error as Error & {
      readonly code?: unknown;
      readonly stdout?: unknown;
      readonly stderr?: unknown;
    };
    const stdout = typeof failure.stdout === "string" ? lastCharacters(failure.stdout, 2_000) : "";
    const stderr = typeof failure.stderr === "string" ? lastCharacters(failure.stderr, 2_000) : "";
    const detail = [stdout, stderr].filter((value) => value.length > 0).join(" ");
    throw new Error(
      `Upgrade subprocess failed${failure.code === undefined ? "" : ` with code ${String(failure.code)}`}.${detail.length === 0 ? "" : ` ${detail}`}`
    );
  }
}

function parseJson(bytes: Uint8Array, label: string): unknown {
  try {
    return JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch {
    throw new Error(`${label} was not valid JSON.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function lastNonEmptyLine(value: string): string {
  return value.trim().split(/\r?\n/).filter((line) => line.length > 0).at(-1)?.trim() ?? "";
}

function lastCharacters(value: string, maximum: number): string {
  return value.length <= maximum ? value : value.slice(value.length - maximum);
}
