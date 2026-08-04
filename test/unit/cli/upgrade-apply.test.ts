import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  downloadAndVerifyUpgradeRelease,
  runUpgradeCommand,
  verifyDownloadedUpgradeRelease,
  windowsNpmInvocation,
  type UpgradeVerificationEvidence,
  type VerifiedUpgradeRelease
} from "../../../src/cli/upgrade-apply.js";
import type { UpgradeInstallation, UpgradePreviewResult } from "../../../src/cli/upgrade.js";

const COMMIT = "a".repeat(40);
const VERSION = "0.256.0";
const FILENAME = `hsinpu-symbol-lattice-${VERSION}.tgz`;
const TARBALL_URL = `https://github.com/HsinPu/symbol-lattice/releases/download/v${VERSION}/${FILENAME}`;

describe("verified release upgrade execution", () => {
  it("bypasses the Windows shell by resolving npm's JavaScript entrypoint", () => {
    expect(windowsNpmInvocation(
      ["--prefix", "C:\\path with spaces & symbols", "install", "package.tgz"],
      {
        nodeExecutable: "C:\\Program Files\\nodejs\\node.exe",
        npmExecPath: "C:\\custom npm\\npm-cli.js",
        exists: (path) => path === "C:\\custom npm\\npm-cli.js"
      }
    )).toEqual({
      command: "C:\\Program Files\\nodejs\\node.exe",
      args: [
        "C:\\custom npm\\npm-cli.js",
        "--prefix",
        "C:\\path with spaces & symbols",
        "install",
        "package.tgz"
      ]
    });

    expect(() => windowsNpmInvocation([], {
      nodeExecutable: "C:\\portable\\node.exe",
      exists: () => false
    })).toThrow("refusing to invoke npm through a shell");
  });

  it("requires checksum, manifest, and GitHub provenance to agree", () => {
    const fixture = releaseFixture();
    const evidence = verifyDownloadedUpgradeRelease(fixture);

    expect(evidence).toMatchObject({
      verified: true,
      artifact: {
        filename: FILENAME,
        sizeBytes: fixture.tarball.byteLength,
        sha256: fixture.sha256
      },
      manifest: {
        packageName: "@hsinpu/symbol-lattice",
        packageVersion: VERSION,
        releaseTag: `v${VERSION}`,
        releaseCommit: COMMIT,
        repository: "HsinPu/symbol-lattice"
      },
      attestation: {
        source: "github-artifact-attestations-api",
        endpoint: fixture.attestationEndpoint,
        workflowInvocationId: "https://github.com/HsinPu/symbol-lattice/actions/runs/123/attempts/1"
      }
    });
  });

  it("fails closed for tampered checksum, manifest, or provenance", () => {
    const fixture = releaseFixture();

    expect(() => verifyDownloadedUpgradeRelease({
      ...fixture,
      checksumText: `${"0".repeat(64)}  ${FILENAME}\n`
    })).toThrow("checksum");

    expect(() => verifyDownloadedUpgradeRelease({
      ...fixture,
      manifestText: JSON.stringify({
        ...JSON.parse(fixture.manifestText),
        release: { tag: `v${VERSION}`, commit: "b".repeat(40), repository: "other/repo" }
      })
    })).toThrow("manifest");

    expect(() => verifyDownloadedUpgradeRelease({
      ...fixture,
      attestationPayload: attestationPayload({
        filename: FILENAME,
        sha256: fixture.sha256,
        version: VERSION,
        commit: "b".repeat(40)
      })
    })).toThrow("provenance");
  });

  it("downloads only bounded evidence from trusted GitHub hosts", async () => {
    const fixture = releaseFixture();
    const fetchImplementation = vi.fn(async (endpoint: string | URL | Request) => {
      const url = String(endpoint);
      if (url === TARBALL_URL) return responseAt(url, fixture.tarball);
      if (url === `${TARBALL_URL}.sha256`) return responseAt(url, fixture.checksumText);
      if (url === `${TARBALL_URL}.manifest.json`) return responseAt(url, fixture.manifestText);
      if (url === fixture.attestationEndpoint) {
        return responseAt(url, JSON.stringify(fixture.attestationPayload));
      }
      return responseAt(url, "missing", { status: 404 });
    }) as typeof fetch;

    const result = await downloadAndVerifyUpgradeRelease(
      upgradePreview({ kind: "npm-global" }),
      fetchImplementation
    );

    expect(result.evidence.artifact.sha256).toBe(fixture.sha256);
    expect(fetchImplementation).toHaveBeenCalledTimes(4);
  });

  it("refuses oversized evidence and redirects outside trusted GitHub hosts", async () => {
    const fixture = releaseFixture();
    const oversizedFetch = vi.fn(async (endpoint: string | URL | Request) => {
      const url = String(endpoint);
      if (url === TARBALL_URL) {
        return responseAt(url, fixture.tarball, { headers: { "content-length": String(32 * 1024 * 1024 + 1) } });
      }
      if (url === `${TARBALL_URL}.sha256`) return responseAt(url, fixture.checksumText);
      return responseAt(url, fixture.manifestText);
    }) as typeof fetch;
    await expect(downloadAndVerifyUpgradeRelease(
      upgradePreview({ kind: "npm-global" }),
      oversizedFetch
    )).rejects.toThrow("exceeded");

    const redirectedFetch = vi.fn(async (endpoint: string | URL | Request) => {
      const url = String(endpoint);
      if (url === TARBALL_URL) return responseAt("https://example.com/release.tgz", fixture.tarball);
      if (url === `${TARBALL_URL}.sha256`) return responseAt(url, fixture.checksumText);
      return responseAt(url, fixture.manifestText);
    }) as typeof fetch;
    await expect(downloadAndVerifyUpgradeRelease(
      upgradePreview({ kind: "npm-global" }),
      redirectedFetch
    )).rejects.toThrow("untrusted host");
  });

  it("verifies without installing and reports whether the layout can be applied", async () => {
    const preview = upgradePreview({ kind: "source-checkout", root: "C:/repo" });
    const verified = verifiedRelease();
    const verifyRelease = vi.fn(async () => verified);
    const installRelease = vi.fn();

    const result = await runUpgradeCommand(
      { version: VERSION, verify: true },
      {
        createPreview: async () => preview,
        verifyRelease,
        installRelease
      }
    );

    expect(result).toMatchObject({
      mode: "verify",
      status: "verified",
      verification: verified.evidence,
      mutation: { performed: false, automaticApplySupported: false }
    });
    expect(verifyRelease).toHaveBeenCalledWith(preview);
    expect(installRelease).not.toHaveBeenCalled();
  });

  it("requires confirmation and refuses unsupported, implicit downgrade, and conflicting modes", async () => {
    const npmPreview = upgradePreview({ kind: "npm-global" });

    await expect(runUpgradeCommand(
      { version: VERSION, apply: true },
      { createPreview: async () => npmPreview }
    )).rejects.toThrow("--yes");

    await expect(runUpgradeCommand(
      { version: VERSION, apply: true, yes: true },
      { createPreview: async () => upgradePreview({ kind: "source-checkout", root: "C:/repo" }) }
    )).rejects.toThrow("source checkout");

    await expect(runUpgradeCommand(
      { version: "0.1.0", apply: true, yes: true },
      { createPreview: async () => ({ ...npmPreview, status: "downgrade-selected", targetVersion: "0.1.0" }) }
    )).rejects.toThrow("--allow-downgrade");

    await expect(runUpgradeCommand(
      { version: VERSION, verify: true, apply: true, yes: true },
      { createPreview: async () => npmPreview }
    )).rejects.toThrow("either --verify or --apply");

    await expect(runUpgradeCommand(
      { version: VERSION, force: true },
      { createPreview: async () => npmPreview }
    )).rejects.toThrow("--force is accepted only together with --apply");
  });

  it("applies only verified bytes and returns the post-install version proof", async () => {
    const preview = upgradePreview({ kind: "npm-local", root: "C:/project" });
    const verified = verifiedRelease();
    const verifyRelease = vi.fn(async () => verified);
    const installation = {
      kind: "npm-local" as const,
      reportedVersion: VERSION,
      command: {
        executable: "npm" as const,
        args: ["--prefix", "C:/project", "install", "--no-save", "verified.tgz"]
      }
    };
    const installRelease = vi.fn(async () => installation);

    const result = await runUpgradeCommand(
      { version: VERSION, apply: true, yes: true },
      {
        createPreview: async () => preview,
        verifyRelease,
        installRelease
      }
    );

    expect(result).toMatchObject({
      mode: "apply",
      status: "applied",
      verification: verified.evidence,
      installation,
      mutation: {
        performed: true,
        automaticApplySupported: true,
        confirmed: true
      }
    });
    expect(installRelease).toHaveBeenCalledWith(preview.installation, VERSION, verified);
  });

  it("does not download or mutate an already-current installation unless forced", async () => {
    const preview = { ...upgradePreview({ kind: "npm-global" }), status: "up-to-date" as const };
    const verifyRelease = vi.fn(async () => verifiedRelease());
    const installRelease = vi.fn();

    const result = await runUpgradeCommand(
      { version: VERSION, apply: true, yes: true },
      { createPreview: async () => preview, verifyRelease, installRelease }
    );

    expect(result).toMatchObject({
      mode: "apply",
      status: "already-current",
      verification: null,
      installation: null,
      mutation: { performed: false, confirmed: true }
    });
    expect(verifyRelease).not.toHaveBeenCalled();
    expect(installRelease).not.toHaveBeenCalled();
  });
});

function releaseFixture() {
  const tarball = Buffer.from("verified-symbol-lattice-tarball");
  const sha256 = createHash("sha256").update(tarball).digest("hex");
  const manifestText = JSON.stringify({
    schemaVersion: 1,
    package: {
      name: "@hsinpu/symbol-lattice",
      version: VERSION,
      private: true
    },
    release: {
      tag: `v${VERSION}`,
      commit: COMMIT,
      repository: "HsinPu/symbol-lattice",
      channel: "github-release-tarball"
    },
    artifact: {
      filename: FILENAME,
      sizeBytes: tarball.byteLength,
      sha256,
      checksumFilename: `${FILENAME}.sha256`
    },
    installation: {
      npmRegistryPublished: false,
      requiresNode: ">=22.13 <25"
    }
  });
  const attestationEndpoint = `https://api.github.com/repos/HsinPu/symbol-lattice/attestations/sha256:${sha256}`;
  return {
    targetVersion: VERSION,
    tarballUrl: TARBALL_URL,
    tarball,
    sha256,
    checksumText: `${sha256}  ${FILENAME}\n`,
    manifestText,
    attestationPayload: attestationPayload({ filename: FILENAME, sha256, version: VERSION, commit: COMMIT }),
    attestationEndpoint
  };
}

function attestationPayload(input: {
  readonly filename: string;
  readonly sha256: string;
  readonly version: string;
  readonly commit: string;
}): unknown {
  const statement = {
    _type: "https://in-toto.io/Statement/v1",
    subject: [{ name: input.filename, digest: { sha256: input.sha256 } }],
    predicateType: "https://slsa.dev/provenance/v1",
    predicate: {
      buildDefinition: {
        externalParameters: {
          workflow: {
            ref: `refs/tags/v${input.version}`,
            repository: "https://github.com/HsinPu/symbol-lattice"
          }
        },
        resolvedDependencies: [{
          uri: `git+https://github.com/HsinPu/symbol-lattice@refs/tags/v${input.version}`,
          digest: { gitCommit: input.commit }
        }]
      },
      runDetails: {
        metadata: {
          invocationId: "https://github.com/HsinPu/symbol-lattice/actions/runs/123/attempts/1"
        }
      }
    }
  };
  return {
    attestations: [{
      bundle: {
        dsseEnvelope: {
          payload: Buffer.from(JSON.stringify(statement), "utf8").toString("base64")
        }
      }
    }]
  };
}

function upgradePreview(installation: UpgradeInstallation): UpgradePreviewResult {
  return {
    schemaVersion: 1,
    mode: "preview",
    status: "update-available",
    currentVersion: "0.255.4",
    targetVersion: VERSION,
    release: {
      source: "explicit-version",
      repository: "HsinPu/symbol-lattice",
      endpoints: [
        "https://api.github.com/repos/HsinPu/symbol-lattice/releases/latest",
        "https://api.github.com/repos/HsinPu/symbol-lattice/tags?per_page=100"
      ],
      networkRequested: false,
      artifacts: {
        tarball: TARBALL_URL,
        checksum: `${TARBALL_URL}.sha256`,
        manifest: `${TARBALL_URL}.manifest.json`
      }
    },
    installation: {
      ...installation,
      steps: [],
      diagnostics: []
    },
    mutation: {
      performed: false,
      automaticApplySupported: false
    },
    notes: []
  };
}

function verifiedRelease(): VerifiedUpgradeRelease {
  const fixture = releaseFixture();
  const evidence = verifyDownloadedUpgradeRelease(fixture);
  return { evidence: evidence as UpgradeVerificationEvidence, tarball: fixture.tarball };
}

function responseAt(
  url: string,
  body: BodyInit,
  init: ResponseInit = {}
): Response {
  const response = new Response(body, init);
  Object.defineProperty(response, "url", { value: url });
  return response;
}
