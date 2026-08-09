import { readFile, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ARTIFACT_LANGUAGES } from "../../src/domain/index.js";
import { FRAMEWORK_CAPABILITY_IDS } from "../../src/extraction/index.js";
import { SUPPORTED_EXTENSIONS } from "../../src/infrastructure/filesystem/index.js";

import {
  classifyCapabilitySmokeStages,
  createCliRuntime,
  createCapabilitySmokePlan,
  runCapabilitySmokeCase
} from "../../scripts/capability-smoke-matrix.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const registries = {
  artifactLanguages: ["typescript", "python", "java"],
  discoverableLanguages: ["typescript", "python", "java"],
  frameworkCapabilityIds: ["nextjs", "fastapi"]
};

function manifest(overrides = {}) {
  return {
    schemaVersion: 1,
    matrixId: "capability-smoke-v1",
    languageCases: [
      {
        id: "typescript-basic",
        language: "typescript",
        fixturePath: "fixtures/typescript.ts",
        expectedFilePath: "src/typescript.ts",
        expectedSymbol: "typescriptEntry",
        relation: {
          command: "callees",
          reference: "typescriptEntry",
          expectedTarget: "typescriptHelper"
        }
      },
      {
        id: "python-basic",
        language: "python",
        fixturePath: "fixtures/python.py",
        expectedFilePath: "src/python.py",
        expectedSymbol: "python_entry",
        relation: {
          command: "callees",
          reference: "python_entry",
          expectedTarget: "python_helper"
        }
      }
    ],
    frameworkCases: [
      {
        id: "nextjs-basic",
        framework: "nextjs",
        capabilityId: "nextjs",
        language: "typescript",
        fixturePath: "fixtures/nextjs",
        expectedFilePath: "pages/index.tsx",
        relation: { command: "routes", expectedPath: "/" }
      }
    ],
    ...overrides
  };
}

describe("capability smoke matrix contract", () => {
  it("ships the executable matrix script, manifest, and fixtures in the package", async () => {
    const packageJson = JSON.parse(await readFile(resolve(projectRoot, "package.json"), "utf8"));

    expect(packageJson.files).toEqual(expect.arrayContaining([
      "scripts/capability-smoke-matrix.mjs",
      "benchmark/capability-smoke-matrix/manifest.json",
      "benchmark/capability-smoke-matrix/fixtures"
    ]));
  });

  it("removes a temporary project when fixture preparation fails", async () => {
    const prefix = "symbol-lattice-capability-smoke-";
    const before = new Set((await readdir(tmpdir())).filter((name) => name.startsWith(prefix)));
    const runtime = createCliRuntime({
      projectRoot,
      cliEntryPath: resolve(projectRoot, "dist", "cli", "main.js"),
      keepTemporaryProjects: false
    });

    await expect(runtime.prepareProject({
      id: "missing-fixture",
      fixturePath: "benchmark/capability-smoke-matrix/fixtures/missing.ts",
      expectedFilePath: "src/missing.ts"
    })).rejects.toThrow();

    const after = (await readdir(tmpdir())).filter((name) => name.startsWith(prefix));
    expect(after.filter((name) => !before.has(name))).toEqual([]);
  });

  it("keeps the committed first-batch manifest aligned with live registries and fixtures", async () => {
    const committedManifest = JSON.parse(
      await readFile(
        resolve(projectRoot, "benchmark", "capability-smoke-matrix", "manifest.json"),
        "utf8"
      )
    );
    const plan = createCapabilitySmokePlan(committedManifest, {
      artifactLanguages: ARTIFACT_LANGUAGES,
      discoverableLanguages: [...new Set(SUPPORTED_EXTENSIONS.values())],
      frameworkCapabilityIds: FRAMEWORK_CAPABILITY_IDS
    });

    expect(plan.languageCases).toHaveLength(14);
    expect(plan.frameworkCases).toHaveLength(10);
    expect(new Set(plan.registryCoverage.languages.selected)).toEqual(
      new Set([
        "typescript",
        "javascript",
        "python",
        "java",
        "go",
        "rust",
        "c",
        "cpp",
        "csharp",
        "php",
        "ruby",
        "kotlin",
        "swift",
        "dart"
      ])
    );
    expect(plan.frameworkCases.filter((candidate) => candidate.capabilityId === null)).toEqual([
      expect.objectContaining({ id: "nuxt-basic", framework: "Nuxt" })
    ]);
    for (const candidate of [...plan.languageCases, ...plan.frameworkCases]) {
      await expect(stat(resolve(projectRoot, candidate.fixturePath))).resolves.toBeDefined();
    }
  });

  it("derives selected and deferred coverage from the authoritative registries", () => {
    expect(createCapabilitySmokePlan(manifest(), registries)).toMatchObject({
      schemaVersion: 1,
      matrixId: "capability-smoke-v1",
      registryCoverage: {
        languages: {
          registered: ["typescript", "python", "java"],
          selected: ["typescript", "python"],
          deferred: ["java"]
        },
        frameworks: {
          registered: ["nextjs", "fastapi"],
          selected: ["nextjs"],
          deferred: ["fastapi"]
        }
      }
    });
  });

  it("fails closed when a case drifts from discovery or framework registries", () => {
    expect(() =>
      createCapabilitySmokePlan(
        manifest({
          languageCases: [
            {
              ...manifest().languageCases[0],
              language: "java"
            }
          ]
        }),
        { ...registries, discoverableLanguages: ["typescript", "python"] }
      )
    ).toThrow("not discoverable");

    expect(() =>
      createCapabilitySmokePlan(
        manifest({
          frameworkCases: [
            {
              ...manifest().frameworkCases[0],
              capabilityId: "unknown-framework"
            }
          ]
        }),
        registries
      )
    ).toThrow("not registered");
  });

  it("classifies usable, partial, scan-only, and unavailable outcomes without hiding failures", () => {
    const passing = {
      init: true,
      noOpSync: true,
      changedSync: true,
      files: true,
      symbol: true,
      relation: true
    };

    expect(classifyCapabilitySmokeStages(passing)).toBe("basic-usable");
    expect(classifyCapabilitySmokeStages({ ...passing, relation: false })).toBe("partial-usable");
    expect(
      classifyCapabilitySmokeStages({ ...passing, symbol: false, relation: false })
    ).toBe("scan-only");
    expect(
      classifyCapabilitySmokeStages({ ...passing, changedSync: false, relation: false })
    ).toBe("unavailable");
  });

  it("runs the complete init, sync, inventory, symbol, and relation flow", async () => {
    const commands = [];
    let changed = false;
    const runtime = {
      async prepareProject() {
        return "C:/fixture/project";
      },
      async mutate() {
        changed = true;
      },
      async cleanup() {},
      async runJson(command, arguments_) {
        commands.push([command, ...arguments_]);
        if (command === "init") {
          return { initialized: true, stale: false, generationId: "generation:1" };
        }
        if (command === "sync") {
          return {
            initialized: true,
            stale: false,
            generationId: changed ? "generation:2" : "generation:1"
          };
        }
        if (command === "files") {
          return {
            files: [{ filePath: "src/typescript.ts", language: "typescript" }]
          };
        }
        if (command === "find") {
          return { symbols: [{ name: "typescriptEntry" }] };
        }
        if (command === "callees") {
          return { relations: [{ symbol: { name: "typescriptHelper" } }] };
        }
        throw new Error(`Unexpected command: ${command}`);
      }
    };

    await expect(runCapabilitySmokeCase(manifest().languageCases[0], "language", runtime))
      .resolves.toMatchObject({
        id: "typescript-basic",
        kind: "language",
        classification: "basic-usable",
        stages: {
          init: true,
          noOpSync: true,
          changedSync: true,
          files: true,
          symbol: true,
          relation: true
        },
        evidence: {
          initialGenerationId: "generation:1",
          noOpGenerationId: "generation:1",
          changedGenerationId: "generation:2"
        },
        errors: []
      });
    expect(commands.map(([command]) => command)).toEqual([
      "init",
      "sync",
      "sync",
      "files",
      "find",
      "callees"
    ]);
  });
});
