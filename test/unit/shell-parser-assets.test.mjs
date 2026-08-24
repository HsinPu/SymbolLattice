import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import {
  copyShellParserAssets,
  SHELL_ASSET_MANIFEST_SHA256,
  verifyShellParserAssets
} from "../../scripts/build/copy-shell-parser-assets.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sourceDirectory = join(repositoryRoot, "src", "assets", "shell");
const temporaryDirectories = [];
const execFileAsync = promisify(execFile);

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("Shell parser asset closure", () => {
  it("verifies the source-owned manifest and retained WASM hash", async () => {
    const result = await verifyShellParserAssets(sourceDirectory);

    expect(result.manifestSha256).toBe(SHELL_ASSET_MANIFEST_SHA256);
    expect(result.files).toEqual([
      "Binaryen-Apache-2.0.txt",
      "Go-BSD-3-Clause.txt",
      "LLVM-compiler-rt-Apache-2.0-WITH-LLVM-exception.txt",
      "THIRD_PARTY_NOTICES.md",
      "TinyGo-BSD-3-Clause.txt",
      "asset-manifest.json",
      "mvdan-sh-BSD-3-Clause.txt",
      "mvdan-sh-v3.13.1-tinygo-v0.41.1.wasm",
      "provenance.json",
      "sbom.cdx.json"
    ]);
    expect(result.entries.find(({ path }) => path.endsWith(".wasm"))).toMatchObject({
      bytes: 319_617,
      sha256: "e2133afeda7a69abd8af28d64138f5f7fff7dc42e836b382e80b0ffb9cadcf45"
    });
  });

  it("copies the complete closure and re-verifies destination bytes", async () => {
    const root = await mkdtemp(join(tmpdir(), "SymbolLattice-shell-assets-"));
    temporaryDirectories.push(root);
    const destinationDirectory = join(root, "dist", "assets", "shell");

    const copied = await copyShellParserAssets({ sourceDirectory, destinationDirectory });

    expect(copied.files).toEqual((await readdir(sourceDirectory)).sort());
    await expect(verifyShellParserAssets(destinationDirectory)).resolves.toEqual(copied);
  });

  it("rejects any stale or corrupt source asset before copying", async () => {
    const root = await mkdtemp(join(tmpdir(), "SymbolLattice-shell-assets-corrupt-"));
    temporaryDirectories.push(root);
    const corruptDirectory = join(root, "shell");
    await cp(sourceDirectory, corruptDirectory, { recursive: true });
    const provenancePath = join(corruptDirectory, "provenance.json");
    await writeFile(provenancePath, `${await readFile(provenancePath, "utf8")} `, "utf8");

    await expect(verifyShellParserAssets(corruptDirectory)).rejects.toThrow(/integrity mismatch/u);
  });

  it("proves each retained license raw-byte normalization and provenance mapping", async () => {
    const provenance = JSON.parse(
      await readFile(join(sourceDirectory, "provenance.json"), "utf8")
    );
    const expected = new Map([
      ["Binaryen-Apache-2.0.txt", {
        retainedRawSha256: "219791af2c0242ae92c126ed8a8b11076d6c61d78a7b3901194a345179da0537",
        normalization: "CRLF-to-LF-only",
        distributedSha256: "64c0d02491e16eced74826440ecd2bcf7722d37fa586faf457b2494293afbffe"
      }],
      ["Go-BSD-3-Clause.txt", {
        retainedRawSha256: "911f8f5782931320f5b8d1160a76365b83aea6447ee6c04fa6d5591467db9dad",
        normalization: "none",
        distributedSha256: "911f8f5782931320f5b8d1160a76365b83aea6447ee6c04fa6d5591467db9dad"
      }],
      ["LLVM-compiler-rt-Apache-2.0-WITH-LLVM-exception.txt", {
        retainedRawSha256: "815455237d89628f7b995a9e11a6e9074f7443afdf63507d715a676f80d874a4",
        normalization: "CRLF-to-LF-only",
        distributedSha256: "1a8f1058753f1ba890de984e48f0242a3a5c29a6a8f2ed9fd813f36985387e8d"
      }],
      ["mvdan-sh-BSD-3-Clause.txt", {
        retainedRawSha256: "ce63850f77649f00d1394045e2794ffb09a5596beabac51c9548edd958845d7c",
        normalization: "none",
        distributedSha256: "ce63850f77649f00d1394045e2794ffb09a5596beabac51c9548edd958845d7c"
      }],
      ["TinyGo-BSD-3-Clause.txt", {
        retainedRawSha256: "0e340ab7d0f8aa7b94ca819a5c79abf5173f7f10e9f235a6c873974095b9393d",
        normalization: "CRLF-to-LF-only",
        distributedSha256: "4cb7d99a97ebd57584ea8398898c4b0bbbcb39662330712b43153efdad308766"
      }]
    ]);
    const { createHash } = await import("node:crypto");

    expect(provenance.licenseDistribution).toEqual(Object.fromEntries(expected));
    for (const [path, mapping] of expected) {
      const distributed = await readFile(join(sourceDirectory, path));
      expect(createHash("sha256").update(distributed).digest("hex"), path)
        .toBe(mapping.distributedSha256);
      const text = distributed.toString("utf8");
      expect(text.includes("\r"), path).toBe(false);
      const reconstructedRaw = mapping.normalization === "CRLF-to-LF-only"
        ? Buffer.from(text.replaceAll("\n", "\r\n"), "utf8")
        : distributed;
      expect(createHash("sha256").update(reconstructedRaw).digest("hex"), path)
        .toBe(mapping.retainedRawSha256);
      expect(Buffer.from(reconstructedRaw.toString("utf8").replaceAll("\r\n", "\n"), "utf8"), path)
        .toEqual(distributed);
    }

    const notice = await readFile(join(sourceDirectory, "THIRD_PARTY_NOTICES.md"), "utf8");
    expect(notice).toContain("CRLF-to-LF-only");
    expect(notice).not.toMatch(/raw[- ]identical/u);
  });

  it("describes the distributed v0.432 product runtime and preserves spike lineage separately", async () => {
    const sbom = JSON.parse(await readFile(join(sourceDirectory, "sbom.cdx.json"), "utf8"));
    const provenance = JSON.parse(
      await readFile(join(sourceDirectory, "provenance.json"), "utf8")
    );
    const componentProperties = Object.fromEntries(
      sbom.metadata.component.properties.map(({ name, value }) => [name, value])
    );

    expect(sbom.metadata.component).toMatchObject({
      "bom-ref": "symbollattice-shell-wasm-runtime-v0.432.0",
      version: "0.432.0"
    });
    expect(componentProperties["symbollattice:distribution-state"]).toBe("product-runtime");
    expect(provenance.runtimeEvidence).toMatchObject({
      architecture: "synchronous-in-process",
      modulePolicy: "compile-once-per-process",
      instancePolicy: "fresh-instance-per-file",
      sourceFailurePolicy: "file-only",
      packagingFailurePolicy: "abort-generation"
    });
    expect(provenance.runtimeEvidence.hostPreflight).toEqual([
      "source-byte-limit",
      "strict-utf8",
      "nul-rejection",
      "physical-line-limit"
    ]);
    expect(provenance.historicalLineage).toMatchObject({
      feasibilityPrototype: {
        distributionState: "architecture-spike-only-no-product",
        sbomSha256: "ef781d28289f6f4418178e77cdecdb3d334c4b084449b71c86cef4a858937020"
      }
    });
  });

  it("rejects a provenance-field mutation even when its JSON remains valid", async () => {
    const root = await mkdtemp(join(tmpdir(), "SymbolLattice-shell-provenance-mutation-"));
    temporaryDirectories.push(root);
    const mutatedDirectory = join(root, "shell");
    await cp(sourceDirectory, mutatedDirectory, { recursive: true });
    const path = join(mutatedDirectory, "provenance.json");
    const provenance = JSON.parse(await readFile(path, "utf8"));
    provenance.licenseDistribution["TinyGo-BSD-3-Clause.txt"].normalization = "none";
    await writeFile(path, `${JSON.stringify(provenance, null, 2)}\n`, "utf8");

    await expect(verifyShellParserAssets(mutatedDirectory)).rejects.toThrow(/integrity mismatch/u);
  });

  it("retains the exact approved adapter source closure", async () => {
    const expected = new Map([
      ["go.mod", "571ba9785a7bf72318db5456747ef9a90dc9cdcf0e3a230ca8145542551dd7a1"],
      ["go.sum", "4f8dae710f8ba10a64cf141ef7ed11664d1eaa49257e76383f0c556812cd7f3f"],
      ["main.go", "111471306178d5deee4b4cd1318505504c99c2203ffde50b64863d0ac4b538a7"],
      ["target.json", "092b63575064a94b09316f926d92a6f07594ed44241eb028102485d73f713f1d"]
    ]);
    const { createHash } = await import("node:crypto");
    const adapterDirectory = join(repositoryRoot, "tools", "shell-parser-adapter");

    expect((await readdir(adapterDirectory)).sort()).toEqual([...expected.keys()].sort());
    for (const [path, sha256] of expected) {
      const bytes = await readFile(join(adapterDirectory, path));
      expect(createHash("sha256").update(bytes).digest("hex"), path).toBe(sha256);
    }
  });

  it("disables Git text conversion for every hash-bound asset and adapter file", async () => {
    const attributes = await readFile(join(repositoryRoot, ".gitattributes"), "utf8");
    expect(attributes).toBe(
      "/src/assets/shell/* -text\n/src/assets/lua/* -text\n/tools/shell-parser-adapter/* -text\n"
    );
    const paths = [
      ...(await readdir(sourceDirectory)).map((path) => `src/assets/shell/${path}`),
      ...(await readdir(join(repositoryRoot, "tools", "shell-parser-adapter")))
        .map((path) => `tools/shell-parser-adapter/${path}`)
    ].sort();
    const { stdout } = await execFileAsync(
      "git",
      [
        "-c",
        `safe.directory=${repositoryRoot.replaceAll("\\", "/")}`,
        "check-attr",
        "text",
        "--",
        ...paths
      ],
      { cwd: repositoryRoot, encoding: "utf8" }
    );

    expect(stdout.trim().split(/\r?\n/u)).toEqual(
      paths.map((path) => `${path}: text: unset`)
    );
  });

  it("keeps the build hook responsible for copying assets after TypeScript", async () => {
    const packageJson = JSON.parse(await readFile(join(repositoryRoot, "package.json"), "utf8"));

    expect(packageJson.scripts.build).toContain("scripts/build/copy-shell-parser-assets.mjs");
    expect(packageJson.scripts.prepack).toBe("npm run build");
  });
});
