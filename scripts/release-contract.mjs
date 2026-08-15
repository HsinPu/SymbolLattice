#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PACKAGE_NAME = "@hsinpu/symbol-lattice";
const REPOSITORY = "HsinPu/SymbolLattice";
const REPOSITORY_URL = "git+https://github.com/HsinPu/SymbolLattice.git";
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const REQUIRED_ARGUMENTS = ["tag", "commit", "tarballPath", "outputDirectory"];
const ARGUMENT_NAMES = new Map([
  ["--tag", "tag"],
  ["--commit", "commit"],
  ["--tarball", "tarballPath"],
  ["--output-dir", "outputDirectory"]
]);

export function expectedNpmTarballName(packageName, version) {
  if (typeof packageName !== "string" || !/^@?[a-z0-9][a-z0-9._/-]*$/.test(packageName)) {
    throw new Error("Release package name is invalid.");
  }
  if (typeof version !== "string" || !SEMVER.test(version)) {
    throw new Error("Release package version is not valid SemVer.");
  }
  return `${packageName.replace(/^@/, "").replaceAll("/", "-")}-${version}.tgz`;
}

export function validateReleaseIdentity(identity) {
  if (identity.packageName !== PACKAGE_NAME) {
    throw new Error(`Release package must be ${PACKAGE_NAME}.`);
  }
  if (!SEMVER.test(identity.packageVersion)) {
    throw new Error("package.json version is not valid SemVer.");
  }
  if (identity.runtimeVersion !== identity.packageVersion) {
    throw new Error("Built runtime version does not match package.json.");
  }
  if (identity.tag !== `v${identity.packageVersion}`) {
    throw new Error("Git tag does not exactly match package.json version.");
  }
  if (!/^[0-9a-f]{40}$/.test(identity.commit)) {
    throw new Error("Release commit must be a full lowercase 40-character Git SHA.");
  }
  if (identity.repositoryUrl !== REPOSITORY_URL) {
    throw new Error(`Release repository must be ${REPOSITORY_URL}.`);
  }
  if (typeof identity.packagePrivate !== "boolean") {
    throw new Error("package.json private must be an explicit boolean.");
  }
}

export function parseReleaseArguments(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const key = ARGUMENT_NAMES.get(flag);
    if (key === undefined) throw new Error(`Unknown argument: ${flag ?? "<missing>"}.`);
    if (Object.hasOwn(result, key)) throw new Error(`Duplicate argument: ${flag}.`);
    const value = argv[index + 1];
    if (value === undefined || value.length === 0 || value.startsWith("--")) {
      throw new Error(`Missing value for ${flag}.`);
    }
    result[key] = value;
  }
  const missing = REQUIRED_ARGUMENTS.filter((key) => !Object.hasOwn(result, key));
  if (missing.length > 0) throw new Error(`Missing required release arguments: ${missing.join(", ")}.`);
  return result;
}

export async function createReleaseContract(options) {
  const projectRoot = resolve(options.projectRoot ?? process.cwd());
  const outputDirectory = resolve(projectRoot, options.outputDirectory);
  const tarballPath = resolve(projectRoot, options.tarballPath);
  if (dirname(tarballPath) !== outputDirectory) {
    throw new Error("Release tarball must be directly inside the selected output directory.");
  }

  const packageJson = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8"));
  const runtimeVersion = options.runtimeVersion ?? await readBuiltRuntimeVersion(projectRoot);
  validateReleaseIdentity({
    packageName: packageJson.name,
    packageVersion: packageJson.version,
    packagePrivate: packageJson.private,
    repositoryUrl: packageJson.repository?.url,
    runtimeVersion,
    tag: options.tag,
    commit: options.commit
  });

  const expectedFilename = expectedNpmTarballName(packageJson.name, packageJson.version);
  const filename = basename(tarballPath);
  if (filename !== expectedFilename) {
    throw new Error(`Release tarball filename must be ${expectedFilename}; found ${filename}.`);
  }
  const bytes = await readFile(tarballPath);
  const metadata = await stat(tarballPath);
  if (!metadata.isFile() || metadata.size === 0) throw new Error("Release tarball must be a non-empty file.");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const checksumFilename = `${filename}.sha256`;
  const manifestFilename = `${filename}.manifest.json`;
  const checksumPath = join(outputDirectory, checksumFilename);
  const manifestPath = join(outputDirectory, manifestFilename);

  const contract = {
    schemaVersion: 1,
    package: {
      name: packageJson.name,
      version: packageJson.version,
      private: packageJson.private
    },
    release: {
      tag: options.tag,
      commit: options.commit,
      repository: REPOSITORY,
      channel: "github-release-tarball"
    },
    artifact: {
      filename,
      sizeBytes: metadata.size,
      sha256,
      checksumFilename
    },
    installation: {
      npmRegistryPublished: false,
      requiresNode: packageJson.engines?.node ?? ">=22.13 <25"
    }
  };

  await mkdir(outputDirectory, { recursive: true });
  await atomicWrite(checksumPath, `${sha256}  ${filename}\n`);
  await atomicWrite(manifestPath, `${JSON.stringify(contract, null, 2)}\n`);

  return {
    ...contract,
    outputs: {
      checksumPath,
      manifestPath
    }
  };
}

async function readBuiltRuntimeVersion(projectRoot) {
  const moduleUrl = pathToFileURL(join(projectRoot, "dist", "version.js"));
  moduleUrl.searchParams.set("release-contract", String(Date.now()));
  const module = await import(moduleUrl.href);
  if (typeof module.SYMBOL_LATTICE_VERSION !== "string") {
    throw new Error("Built runtime does not export SYMBOL_LATTICE_VERSION.");
  }
  return module.SYMBOL_LATTICE_VERSION;
}

async function atomicWrite(path, text) {
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, text, { encoding: "utf8", flag: "wx" });
  try {
    await rename(temporaryPath, path);
  } catch (error) {
    if (error?.code !== "EEXIST" && error?.code !== "EPERM") {
      await rm(temporaryPath, { force: true });
      throw error;
    }
    try {
      await writeFile(path, text, "utf8");
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }
}

function isMainModule() {
  if (process.argv[1] === undefined) return false;
  return resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
}

if (isMainModule()) {
  try {
    const args = parseReleaseArguments(process.argv.slice(2));
    const result = await createReleaseContract(args);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`release-contract: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
