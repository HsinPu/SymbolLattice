import { afterEach, describe, expect, it, vi } from "vitest";

import {
  compareReleaseVersions,
  createUpgradePreview,
  detectUpgradeInstallation,
  resolveLatestGithubRelease
} from "../../../src/cli/upgrade.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("preview-only release upgrade planning", () => {
  it("compares stable and prerelease versions without lexical ordering mistakes", () => {
    expect(compareReleaseVersions("0.9.0", "0.10.0")).toBeLessThan(0);
    expect(compareReleaseVersions("v1.0.0-beta.2", "1.0.0-beta.10")).toBeLessThan(0);
    expect(compareReleaseVersions("1.0.0-rc.1", "1.0.0")).toBeLessThan(0);
    expect(compareReleaseVersions("1.0.0+build.1", "1.0.0+build.2")).toBe(0);
  });

  it("uses an explicit target without making a release network request", async () => {
    const resolveLatestRelease = vi.fn(async () => "9.9.9");

    const result = await createUpgradePreview(
      { version: "v0.254.0" },
      {
        currentVersion: "0.253.0",
        resolveLatestRelease,
        installation: { kind: "source-checkout", root: "C:/repo" }
      }
    );

    expect(resolveLatestRelease).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      schemaVersion: 1,
      mode: "preview",
      status: "update-available",
      currentVersion: "0.253.0",
      targetVersion: "0.254.0",
      release: {
        source: "explicit-version",
        networkRequested: false,
        artifacts: {
          tarball: "https://github.com/HsinPu/SymbolLattice/releases/download/v0.254.0/SymbolLattice-0.254.0.tgz",
          checksum: "https://github.com/HsinPu/SymbolLattice/releases/download/v0.254.0/SymbolLattice-0.254.0.tgz.sha256",
          manifest: "https://github.com/HsinPu/SymbolLattice/releases/download/v0.254.0/SymbolLattice-0.254.0.tgz.manifest.json"
        }
      },
      mutation: {
        performed: false,
        automaticApplySupported: false
      }
    });
    expect(result.installation.steps).toEqual([
      { command: "git", args: ["-C", "C:/repo", "pull", "--ff-only"] },
      { command: "npm", args: ["--prefix", "C:/repo", "ci"] },
      { command: "npm", args: ["--prefix", "C:/repo", "run", "build"] },
      { command: "node", args: ["C:/repo/dist/cli/main.js", "--version"] }
    ]);
  });

  it("performs an explicit latest-release check and remains non-mutating", async () => {
    const resolveLatestRelease = vi.fn(async () => "v0.255.0");

    const result = await createUpgradePreview(
      { check: true },
      {
        currentVersion: "0.254.0",
        resolveLatestRelease,
        installation: { kind: "npm-global" }
      }
    );

    expect(resolveLatestRelease).toHaveBeenCalledOnce();
    expect(result.mode).toBe("check");
    expect(result.status).toBe("update-available");
    expect(result.release).toMatchObject({
      source: "github-catalog",
      networkRequested: true,
      repository: "HsinPu/SymbolLattice"
    });
    expect(result.installation.steps).toEqual([
      {
        command: "npm",
        args: [
          "install",
          "--global",
          "https://github.com/HsinPu/SymbolLattice/releases/download/v0.255.0/SymbolLattice-0.255.0.tgz"
        ]
      }
    ]);
    expect(result.installation.diagnostics).toContain(
      "The previewed command is executed only after --apply --yes verifies the tarball, checksum, manifest, and GitHub attestation."
    );
    expect(result.mutation.performed).toBe(false);
    expect(result.mutation.automaticApplySupported).toBe(true);
  });

  it("distinguishes selected downgrade and current targets", async () => {
    const downgrade = await createUpgradePreview(
      { version: "0.252.0" },
      { currentVersion: "0.253.0", installation: { kind: "unknown", reason: "test" } }
    );
    const current = await createUpgradePreview(
      { version: "0.253.0" },
      { currentVersion: "0.253.0", installation: { kind: "unknown", reason: "test" } }
    );

    expect(downgrade.status).toBe("downgrade-selected");
    expect(current.status).toBe("up-to-date");
  });

  it("reports a local build newer than the published catalog without implying a downgrade choice", async () => {
    const result = await createUpgradePreview(
      { check: true },
      {
        currentVersion: "0.254.0",
        resolveLatestRelease: async () => "0.2.0",
        installation: { kind: "source-checkout", root: "C:/repo" }
      }
    );

    expect(result.status).toBe("local-newer");
    expect(result.release.networkRequested).toBe(true);
  });

  it("rejects non-semver current, explicit, and resolved versions", async () => {
    await expect(
      createUpgradePreview(
        { version: "latest" },
        { currentVersion: "0.253.0", installation: { kind: "unknown", reason: "test" } }
      )
    ).rejects.toThrow("valid semantic version");

    await expect(
      createUpgradePreview(
        {},
        {
          currentVersion: "development",
          resolveLatestRelease: async () => "0.254.0",
          installation: { kind: "unknown", reason: "test" }
        }
      )
    ).rejects.toThrow("current version");

    await expect(
      createUpgradePreview(
        {},
        {
          currentVersion: "0.253.0",
          resolveLatestRelease: async () => "release-next",
          installation: { kind: "unknown", reason: "test" }
        }
      )
    ).rejects.toThrow("release source");
  });

  it("detects source, npm, npx, and unknown installation layouts", () => {
    expect(
      detectUpgradeInstallation({
        entryPath: "C:/repo/dist/cli/main.js",
        cwd: "C:/repo",
        platform: "win32",
        exists: (path) => path === "C:\\repo\\package.json" || path === "C:\\repo\\.git"
      })
    ).toEqual({ kind: "source-checkout", root: "C:\\repo" });

    expect(
      detectUpgradeInstallation({
        entryPath: "C:/Users/me/AppData/Roaming/npm/node_modules/@hsinpu/symbollattice/dist/cli/main.js",
        cwd: "C:/repo",
        platform: "win32"
      })
    ).toEqual({ kind: "npm-global" });

    expect(
      detectUpgradeInstallation({
        entryPath: "C:/repo/node_modules/@hsinpu/symbollattice/dist/cli/main.js",
        cwd: "C:/repo",
        platform: "win32"
      })
    ).toEqual({ kind: "npm-local", root: "C:\\repo" });

    expect(
      detectUpgradeInstallation({
        entryPath: "C:/Users/me/AppData/Local/npm-cache/_npx/hash/node_modules/@hsinpu/symbollattice/dist/cli/main.js",
        cwd: "C:/repo",
        platform: "win32"
      })
    ).toEqual({ kind: "npx" });

    expect(
      detectUpgradeInstallation({
        entryPath: "C:/portable/SymbolLattice.js",
        cwd: "C:/repo",
        platform: "win32"
      })
    ).toEqual({
      kind: "unknown",
      reason: "Unrecognized installation layout at C:/portable/SymbolLattice.js."
    });
  });

  it("accepts only a bounded stable published GitHub release response", async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ tag_name: "v0.254.0", draft: false, prerelease: false }),
      { status: 200, headers: { "content-type": "application/json" } }
    ));
    vi.stubGlobal("fetch", fetchMock);

    await expect(resolveLatestGithubRelease()).resolves.toBe("0.254.0");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/HsinPu/SymbolLattice/releases/latest",
      expect.objectContaining({
        redirect: "error",
        headers: expect.objectContaining({ "User-Agent": "SymbolLattice-upgrade-preview" })
      })
    );
  });

  it("falls back to the highest stable repository tag when no GitHub Release exists", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("not found", { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { name: "v0.253.0" },
        { name: "not-a-version" },
        { name: "v0.254.0-beta.1" },
        { name: "v0.252.0" },
        { name: "v0.254.0" }
      ]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(resolveLatestGithubRelease()).resolves.toBe("0.254.0");
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.github.com/repos/HsinPu/SymbolLattice/tags?per_page=100",
      expect.objectContaining({ redirect: "error" })
    );
  });

  it("fails closed for HTTP errors, prereleases, invalid JSON, and oversized responses", async () => {
    const cases = [
      new Response("not found", { status: 404 }),
      new Response(JSON.stringify({ tag_name: "v0.255.0-beta.1", prerelease: true }), { status: 200 }),
      new Response("not-json", { status: 200 }),
      new Response(JSON.stringify({ tag_name: "v0.255.0" }), {
        status: 200,
        headers: { "content-length": String(64 * 1024 + 1) }
      }),
      new Response("x".repeat(64 * 1024 + 1), { status: 200 })
    ];

    for (const response of cases) {
      vi.stubGlobal("fetch", vi.fn(async () => response.clone()));
      await expect(resolveLatestGithubRelease()).rejects.toThrow(
        "Unable to resolve the latest SymbolLattice release"
      );
    }
  });

  it("cancels a chunked response as soon as the byte limit is crossed", async () => {
    const cancel = vi.fn();
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(40 * 1024));
        if (pulls === 3) controller.close();
      },
      cancel
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(stream, { status: 200 })));

    await expect(resolveLatestGithubRelease()).rejects.toThrow(
      "Unable to resolve the latest SymbolLattice release"
    );
    expect(cancel).toHaveBeenCalled();
    expect(pulls).toBeLessThanOrEqual(3);
  });
});
