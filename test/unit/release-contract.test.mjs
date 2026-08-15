import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createReleaseContract,
  expectedNpmTarballName,
  parseReleaseArguments,
  validateReleaseIdentity
} from "../../scripts/release-contract.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "symbol-lattice-release-contract-"));
  temporaryDirectories.push(root);
  const outputDirectory = join(root, "release");
  await mkdir(outputDirectory);
  await writeFile(join(root, "package.json"), JSON.stringify({
    name: "@hsinpu/symbol-lattice",
    version: "0.255.0",
    private: true,
    repository: {
      type: "git",
      url: "git+https://github.com/HsinPu/SymbolLattice.git"
    }
  }));
  const tarballPath = join(outputDirectory, "hsinpu-symbol-lattice-0.255.0.tgz");
  await writeFile(tarballPath, Buffer.from("verified release bytes"));
  return { root, outputDirectory, tarballPath };
}

describe("GitHub release artifact contract", () => {
  it("derives the exact npm tarball filename for the scoped package", () => {
    expect(expectedNpmTarballName("@hsinpu/symbol-lattice", "0.255.0")).toBe(
      "hsinpu-symbol-lattice-0.255.0.tgz"
    );
  });

  it("requires an exact tag, package/runtime version, commit, and repository identity", () => {
    expect(() => validateReleaseIdentity({
      packageName: "@hsinpu/symbol-lattice",
      packageVersion: "0.255.0",
      packagePrivate: true,
      repositoryUrl: "git+https://github.com/HsinPu/SymbolLattice.git",
      runtimeVersion: "0.255.0",
      tag: "v0.255.0",
      commit: "a".repeat(40)
    })).not.toThrow();

    for (const overrides of [
      { tag: "v0.254.0" },
      { runtimeVersion: "0.254.0" },
      { commit: "main" },
      { packageName: "symbol-lattice" },
      { repositoryUrl: "https://example.com/repository.git" }
    ]) {
      expect(() => validateReleaseIdentity({
        packageName: "@hsinpu/symbol-lattice",
        packageVersion: "0.255.0",
        packagePrivate: true,
        repositoryUrl: "git+https://github.com/HsinPu/SymbolLattice.git",
        runtimeVersion: "0.255.0",
        tag: "v0.255.0",
        commit: "a".repeat(40),
        ...overrides
      })).toThrow();
    }
  });

  it("writes a checksum and deterministic manifest tied to the source commit", async () => {
    const { root, outputDirectory, tarballPath } = await fixture();

    const result = await createReleaseContract({
      projectRoot: root,
      outputDirectory,
      tarballPath,
      tag: "v0.255.0",
      commit: "0123456789abcdef0123456789abcdef01234567",
      runtimeVersion: "0.255.0"
    });

    expect(result).toMatchObject({
      schemaVersion: 1,
      package: {
        name: "@hsinpu/symbol-lattice",
        version: "0.255.0",
        private: true
      },
      release: {
        tag: "v0.255.0",
        commit: "0123456789abcdef0123456789abcdef01234567",
        repository: "HsinPu/SymbolLattice",
        channel: "github-release-tarball"
      },
      artifact: {
        filename: "hsinpu-symbol-lattice-0.255.0.tgz",
        sizeBytes: 22,
        checksumFilename: "hsinpu-symbol-lattice-0.255.0.tgz.sha256"
      },
      installation: {
        npmRegistryPublished: false,
        requiresNode: ">=22.13 <25"
      }
    });
    expect(result.artifact.sha256).toMatch(/^[0-9a-f]{64}$/);

    const checksum = await readFile(result.outputs.checksumPath, "utf8");
    expect(checksum).toBe(`${result.artifact.sha256}  hsinpu-symbol-lattice-0.255.0.tgz\n`);
    const manifest = JSON.parse(await readFile(result.outputs.manifestPath, "utf8"));
    expect(manifest).toEqual({
      schemaVersion: 1,
      package: result.package,
      release: result.release,
      artifact: result.artifact,
      installation: result.installation
    });
  });

  it("refuses a tarball whose basename does not match npm's package/version name", async () => {
    const { root, outputDirectory } = await fixture();
    const wrongPath = join(outputDirectory, "symbol-lattice-latest.tgz");
    await writeFile(wrongPath, "wrong");

    await expect(createReleaseContract({
      projectRoot: root,
      outputDirectory,
      tarballPath: wrongPath,
      tag: "v0.255.0",
      commit: "a".repeat(40),
      runtimeVersion: "0.255.0"
    })).rejects.toThrow("tarball filename");
  });

  it("parses each required CLI argument exactly once and rejects unknown flags", () => {
    expect(parseReleaseArguments([
      "--tag", "v0.255.0",
      "--commit", "a".repeat(40),
      "--tarball", "release/package.tgz",
      "--output-dir", "release"
    ])).toEqual({
      tag: "v0.255.0",
      commit: "a".repeat(40),
      tarballPath: "release/package.tgz",
      outputDirectory: "release"
    });
    expect(() => parseReleaseArguments(["--tag", "v0.255.0"])).toThrow("Missing required");
    expect(() => parseReleaseArguments([
      "--tag", "v0.255.0",
      "--tag", "v0.255.0",
      "--commit", "a".repeat(40),
      "--tarball", "release/package.tgz",
      "--output-dir", "release"
    ])).toThrow("Duplicate");
    expect(() => parseReleaseArguments([
      "--tag", "v0.255.0",
      "--commit", "a".repeat(40),
      "--tarball", "release/package.tgz",
      "--output-dir", "release",
      "--publish"
    ])).toThrow("Unknown argument");
  });
});
