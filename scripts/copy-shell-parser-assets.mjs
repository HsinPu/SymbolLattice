#!/usr/bin/env node

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SHELL_ASSET_MANIFEST_SHA256 =
  "25b76ced19fc8154bc4d80ae32162b1da7dbe75655d50251421c31c9bc55cc0a";

const MANIFEST_FILENAME = "asset-manifest.json";
const MANIFEST_SCHEMA = "symbol-lattice-shell-asset-manifest-v1";
const SHA256 = /^[0-9a-f]{64}$/u;
const SAFE_FILENAME = /^[A-Za-z0-9._-]+$/u;

export async function verifyShellParserAssets(directory) {
  const root = resolve(directory);
  const manifestPath = join(root, MANIFEST_FILENAME);
  const manifestBytes = await requiredFileBytes(manifestPath, MANIFEST_FILENAME);
  const manifestSha256 = digest(manifestBytes);
  if (manifestSha256 !== SHELL_ASSET_MANIFEST_SHA256) {
    throw new Error(
      `Shell asset manifest integrity mismatch: expected ${SHELL_ASSET_MANIFEST_SHA256}, received ${manifestSha256}.`
    );
  }

  let manifest;
  try {
    manifest = JSON.parse(manifestBytes.toString("utf8"));
  } catch (error) {
    throw new Error("Shell asset manifest is not valid JSON.", { cause: error });
  }
  if (
    manifest?.schemaVersion !== MANIFEST_SCHEMA ||
    manifest.selfExcluded !== true ||
    !Number.isInteger(manifest.entryCount) ||
    !Array.isArray(manifest.entries) ||
    manifest.entries.length !== manifest.entryCount ||
    !SHA256.test(manifest.aggregateSha256 ?? "")
  ) {
    throw new Error("Shell asset manifest does not match its source-owned schema.");
  }

  const entries = [];
  const paths = new Set();
  for (const entry of manifest.entries) {
    if (
      typeof entry?.path !== "string" ||
      !SAFE_FILENAME.test(entry.path) ||
      entry.path === MANIFEST_FILENAME ||
      paths.has(entry.path) ||
      !Number.isInteger(entry.bytes) ||
      entry.bytes < 0 ||
      !SHA256.test(entry.sha256 ?? "")
    ) {
      throw new Error("Shell asset manifest contains an invalid or duplicate entry.");
    }
    paths.add(entry.path);
    const bytes = await requiredFileBytes(join(root, entry.path), entry.path);
    const sha256 = digest(bytes);
    if (bytes.byteLength !== entry.bytes || sha256 !== entry.sha256) {
      throw new Error(
        `Shell asset integrity mismatch for ${entry.path}: expected ${entry.sha256}/${entry.bytes}, received ${sha256}/${bytes.byteLength}.`
      );
    }
    entries.push(Object.freeze({ path: entry.path, bytes: entry.bytes, sha256: entry.sha256 }));
  }

  const expectedFiles = [...paths, MANIFEST_FILENAME].sort(compareText);
  const actualFiles = (await readdir(root, { withFileTypes: true }))
    .map((entry) => {
      if (!entry.isFile()) {
        throw new Error(`Shell asset directory contains a non-file entry: ${entry.name}.`);
      }
      return entry.name;
    })
    .sort(compareText);
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error(
      `Shell asset file set mismatch: expected ${expectedFiles.join(", ")}; received ${actualFiles.join(", ")}.`
    );
  }

  const aggregateLines = [...entries]
    .sort((left, right) => compareText(left.path, right.path))
    .map((entry) => `${entry.sha256} ${entry.bytes} ${entry.path}`);
  const aggregateSha256 = digest(Buffer.from(`${aggregateLines.join("\n")}\n`, "utf8"));
  if (aggregateSha256 !== manifest.aggregateSha256) {
    throw new Error(
      `Shell asset aggregate integrity mismatch: expected ${manifest.aggregateSha256}, received ${aggregateSha256}.`
    );
  }

  return Object.freeze({
    manifestSha256,
    aggregateSha256,
    files: Object.freeze(actualFiles),
    entries: Object.freeze(entries)
  });
}

export async function copyShellParserAssets({ sourceDirectory, destinationDirectory }) {
  const source = resolve(sourceDirectory);
  const destination = resolve(destinationDirectory);
  if (source === destination) {
    throw new Error("Shell asset source and destination directories must differ.");
  }
  const sourceEvidence = await verifyShellParserAssets(source);
  await mkdir(destination, { recursive: true });
  const existing = await readdir(destination);
  if (existing.length !== 0) {
    throw new Error(`Shell asset destination must be empty: ${destination}.`);
  }
  for (const filename of sourceEvidence.files) {
    await copyFile(join(source, filename), join(destination, filename));
  }
  return verifyShellParserAssets(destination);
}

async function requiredFileBytes(path, label) {
  let metadata;
  try {
    metadata = await stat(path);
  } catch (error) {
    throw new Error(`Required Shell asset is missing: ${label}.`, { cause: error });
  }
  if (!metadata.isFile()) {
    throw new Error(`Required Shell asset is not a regular file: ${label}.`);
  }
  return readFile(path);
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] !== undefined && resolve(process.argv[1]) === scriptPath) {
  const repositoryRoot = resolve(dirname(scriptPath), "..");
  const result = await copyShellParserAssets({
    sourceDirectory: join(repositoryRoot, "src", "assets", "shell"),
    destinationDirectory: join(repositoryRoot, "dist", "assets", "shell")
  });
  process.stdout.write(`${JSON.stringify({
    status: "copied",
    manifestSha256: result.manifestSha256,
    files: result.files.length
  })}\n`);
}
