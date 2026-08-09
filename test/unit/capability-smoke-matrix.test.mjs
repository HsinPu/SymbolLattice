import { readFile, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ARTIFACT_LANGUAGES } from "../../src/domain/index.js";
import { FRAMEWORK_CAPABILITY_IDS } from "../../src/extraction/index.js";
import { SUPPORTED_EXTENSIONS } from "../../src/infrastructure/filesystem/index.js";

import * as capabilitySmokeMatrix from "../../scripts/capability-smoke-matrix.mjs";

const {
  classifyCapabilitySmokeStages,
  createCliRuntime,
  createCapabilitySmokePlan,
  runCapabilitySmokeCase
} = capabilitySmokeMatrix;

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

function v2Manifest(overrides = {}) {
  return {
    schemaVersion: 2,
    matrixId: "capability-smoke-v2",
    languageCases: [
      {
        id: "typescript-exact",
        language: "typescript",
        fixturePath: "fixtures/typescript.ts",
        expectedFilePath: "src/typescript.ts",
        assertions: {
          symbols: [
            {
              id: "entry",
              name: "typescriptEntry",
              filePath: "src/typescript.ts",
              kind: "function"
            },
            {
              id: "helper",
              name: "typescriptHelper",
              filePath: "src/typescript.ts",
              kind: "function"
            }
          ],
          relations: [
            {
              id: "entry-calls-helper",
              command: "callees",
              source: "entry",
              target: "helper",
              kind: "calls"
            }
          ]
        }
      }
    ],
    frameworkCases: [],
    ...overrides
  };
}

function successfulV2Runtime(overrides = {}) {
  let changed = false;
  const symbols = {
    typescriptEntry: {
      id: "symbol:entry",
      name: "typescriptEntry",
      filePath: "src/typescript.ts",
      kind: "function"
    },
    typescriptHelper: {
      id: "symbol:helper",
      name: "typescriptHelper",
      filePath: "src/typescript.ts",
      kind: "function"
    }
  };
  return {
    async prepareProject() {
      return "C:/fixture/project";
    },
    async mutate() {
      changed = true;
    },
    async cleanup() {},
    async runJson(command, arguments_) {
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
        return { files: [{ filePath: "src/typescript.ts", language: "typescript" }] };
      }
      if (command === "find") {
        return { symbols: [symbols[arguments_[0]]] };
      }
      if (command === "callees") {
        expect(arguments_[0]).toBe("symbol:entry");
        return {
          symbol: symbols.typescriptEntry,
          relations: [
            {
              symbol: symbols.typescriptHelper,
              edge: {
                sourceId: "symbol:entry",
                targetId: "symbol:helper",
                kind: "calls"
              }
            }
          ]
        };
      }
      throw new Error(`Unexpected command: ${command}`);
    },
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

    expect(plan.schemaVersion).toBe(2);
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
    for (const id of ["java-basic", "python-basic"]) {
      expect(plan.languageCases.find((candidate) => candidate.id === id)?.assertions).toEqual(
        expect.objectContaining({
          symbols: expect.arrayContaining([
            expect.objectContaining({ id: "entry" }),
            expect.objectContaining({ id: "helper" })
          ]),
          relations: [expect.objectContaining({
            command: "callees",
            source: "entry",
            target: "helper",
            kind: "calls"
          })]
        })
      );
    }
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

  it("validates schema v2 assertion identities, N/A reasons, and relation references", () => {
    expect(createCapabilitySmokePlan(v2Manifest(), registries)).toMatchObject({
      schemaVersion: 2,
      matrixId: "capability-smoke-v2"
    });

    const assertions = v2Manifest().languageCases[0].assertions;
    expect(() => createCapabilitySmokePlan(v2Manifest({
      languageCases: [{
        ...v2Manifest().languageCases[0],
        assertions: {
          ...assertions,
          symbols: [...assertions.symbols, { ...assertions.symbols[0] }]
        }
      }]
    }), registries)).toThrow("duplicate");
    expect(() => createCapabilitySmokePlan(v2Manifest({
      languageCases: [{
        ...v2Manifest().languageCases[0],
        assertions: {
          symbols: [{ id: "entry", notApplicable: { reason: "" } }],
          relations: [{ id: "call", notApplicable: { reason: "deliberately absent" } }]
        }
      }]
    }), registries)).toThrow("reason");
    expect(() => createCapabilitySmokePlan(v2Manifest({
      languageCases: [{
        ...v2Manifest().languageCases[0],
        assertions: {
          ...assertions,
          relations: [{ ...assertions.relations[0], source: "missing" }]
        }
      }]
    }), registries)).toThrow("source");
    expect(() => createCapabilitySmokePlan(v2Manifest({
      languageCases: [{
        ...v2Manifest().languageCases[0],
        assertions: {
          ...assertions,
          relations: [{ ...assertions.relations[0], target: "missing" }]
        }
      }]
    }), registries)).toThrow("target");
    expect(() => createCapabilitySmokePlan(v2Manifest({
      languageCases: [{
        ...v2Manifest().languageCases[0],
        assertions: {
          symbols: [],
          relations: [{ id: "route", command: "routes", expectedPath: "/" }]
        }
      }]
    }), registries)).toThrow("required symbol");
    expect(() => createCapabilitySmokePlan(v2Manifest({
      languageCases: [{
        ...v2Manifest().languageCases[0],
        assertions: {
          symbols: assertions.symbols,
          relations: [{ id: "route", command: "routes", expectedPath: "/" }]
        }
      }]
    }), registries)).toThrow("required callees");
    expect(createCapabilitySmokePlan(v2Manifest({
      languageCases: [],
      frameworkCases: [{
        id: "next-route",
        framework: "nextjs",
        capabilityId: "nextjs",
        language: "typescript",
        fixturePath: "fixtures/nextjs",
        expectedFilePath: "pages/index.tsx",
        assertions: {
          symbols: [],
          relations: [{ id: "route", command: "routes", expectedPath: "/" }]
        }
      }]
    }), registries).frameworkCases).toHaveLength(1);
  });

  it("dispatches runtime evaluation only from an explicit schema version", async () => {
    const candidate = v2Manifest().languageCases[0];
    await expect(runCapabilitySmokeCase(candidate, "language", successfulV2Runtime()))
      .rejects.toThrow("schemaVersion 1");
    await expect(runCapabilitySmokeCase(candidate, "language", successfulV2Runtime(), 2))
      .resolves.toMatchObject({ classification: "basic-usable" });
  });

  it("records v2 exact symbol and call-edge receipts without accepting same-name impostors", async () => {
    const candidate = v2Manifest().languageCases[0];
    await expect(runCapabilitySmokeCase(candidate, "language", successfulV2Runtime(), 2))
      .resolves.toMatchObject({
        classification: "basic-usable",
        stages: { symbol: true, relation: true },
        assertions: {
          symbols: [
            expect.objectContaining({ id: "entry", status: "passed", actualId: "symbol:entry" }),
            expect.objectContaining({ id: "helper", status: "passed", actualId: "symbol:helper" })
          ],
          relations: [expect.objectContaining({
            id: "entry-calls-helper",
            status: "passed",
            rootId: "symbol:entry",
            targetId: "symbol:helper",
            edge: { sourceId: "symbol:entry", targetId: "symbol:helper", kind: "calls" }
          })]
        }
      });

    const successfulWrongFileRuntime = successfulV2Runtime();
    const wrongFileRuntime = {
      ...successfulWrongFileRuntime,
      async runJson(command, arguments_) {
        if (command === "find" && arguments_[0] === "typescriptEntry") {
          return {
            symbols: [{
              id: "symbol:wrong-file",
              name: "typescriptEntry",
              filePath: "src/other.ts",
              kind: "function"
            }]
          };
        }
        return successfulWrongFileRuntime.runJson(command, arguments_);
      }
    };
    await expect(runCapabilitySmokeCase(candidate, "language", wrongFileRuntime, 2))
      .resolves.toMatchObject({ classification: "scan-only", stages: { symbol: false, relation: false } });

    const successfulWrongTargetRuntime = successfulV2Runtime();
    const wrongTargetRuntime = {
      ...successfulWrongTargetRuntime,
      async runJson(command, arguments_) {
        if (command === "callees") {
          return {
            symbol: {
              id: "symbol:entry",
              name: "typescriptEntry",
              filePath: "src/typescript.ts",
              kind: "function"
            },
            relations: [{
              symbol: {
                id: "symbol:wrong-target",
                name: "typescriptHelper",
                filePath: "src/typescript.ts",
                kind: "function"
              },
              edge: { sourceId: "symbol:entry", targetId: "symbol:wrong-target", kind: "calls" }
            }]
          };
        }
        return successfulWrongTargetRuntime.runJson(command, arguments_);
      }
    };
    await expect(runCapabilitySmokeCase(candidate, "language", wrongTargetRuntime, 2))
      .resolves.toMatchObject({ classification: "partial-usable", stages: { symbol: true, relation: false } });
  });

  it("rejects duplicate selected IDs and stale root or target metadata", async () => {
    const candidate = v2Manifest().languageCases[0];
    const duplicateBase = successfulV2Runtime();
    const duplicateIdRuntime = {
      ...duplicateBase,
      async runJson(command, arguments_) {
        if (command === "find" && arguments_[0] === "typescriptHelper") {
          return {
            symbols: [{
              id: "symbol:entry",
              name: "typescriptHelper",
              filePath: "src/typescript.ts",
              kind: "function"
            }]
          };
        }
        return duplicateBase.runJson(command, arguments_);
      }
    };
    await expect(runCapabilitySmokeCase(candidate, "language", duplicateIdRuntime, 2))
      .resolves.toMatchObject({
        classification: "scan-only",
        stages: { symbol: false, relation: false },
        assertions: {
          symbols: expect.arrayContaining([
            expect.objectContaining({ id: "entry", status: "failed" }),
            expect.objectContaining({ id: "helper", status: "failed" })
          ])
        }
      });

    const staleMetadataBase = successfulV2Runtime();
    const staleMetadataRuntime = {
      ...staleMetadataBase,
      async runJson(command, arguments_) {
        if (command === "callees") {
          return {
            symbol: {
              id: "symbol:entry",
              name: "typescriptEntry",
              filePath: "src/stale.ts",
              kind: "function"
            },
            relations: [{
              symbol: {
                id: "symbol:helper",
                name: "typescriptHelper",
                filePath: "src/typescript.ts",
                kind: "method"
              },
              edge: { sourceId: "symbol:entry", targetId: "symbol:helper", kind: "calls" }
            }]
          };
        }
        return staleMetadataBase.runJson(command, arguments_);
      }
    };
    await expect(runCapabilitySmokeCase(candidate, "language", staleMetadataRuntime, 2))
      .resolves.toMatchObject({ classification: "partial-usable", stages: { symbol: true, relation: false } });
  });

  it("requires every v2 relation and never upgrades all-N/A assertions to basic", async () => {
    const candidate = v2Manifest({
      languageCases: [{
        ...v2Manifest().languageCases[0],
        assertions: {
          ...v2Manifest().languageCases[0].assertions,
          relations: [
            ...v2Manifest().languageCases[0].assertions.relations,
            {
              id: "entry-calls-helper-again",
              command: "callees",
              source: "entry",
              target: "helper",
              kind: "references"
            }
          ]
        }
      }]
    }).languageCases[0];
    await expect(runCapabilitySmokeCase(candidate, "language", successfulV2Runtime(), 2))
      .resolves.toMatchObject({ classification: "partial-usable", stages: { symbol: true, relation: false } });

    const allNotApplicable = v2Manifest({
      languageCases: [{
        ...v2Manifest().languageCases[0],
        assertions: {
          symbols: [{ id: "entry", notApplicable: { reason: "route-only case" } }],
          relations: [{ id: "calls", notApplicable: { reason: "no direct call is asserted" } }]
        }
      }]
    }).languageCases[0];
    await expect(runCapabilitySmokeCase(allNotApplicable, "framework", successfulV2Runtime(), 2))
      .resolves.toMatchObject({
        classification: "partial-usable",
        stages: { symbol: true, relation: false },
        assertions: {
          symbols: [expect.objectContaining({ status: "not-applicable" })],
          relations: [expect.objectContaining({ status: "not-applicable" })]
        }
      });
  });

  it("separates capability diagnostics from execution-integrity failures", async () => {
    const diagnosticSummary = capabilitySmokeMatrix.capabilitySmokeFailureSummary([{
      id: "expected-partial",
      classification: "partial-usable",
      errors: [{ stage: "relation", message: "expected capability miss" }]
    }]);
    expect(diagnosticSummary).toMatchObject({ failedCases: 0, errorCount: 0, cases: [] });
    expect(capabilitySmokeMatrix.capabilitySmokeExitCode(diagnosticSummary)).toBe(0);

    const receipt = await runCapabilitySmokeCase(
      v2Manifest().languageCases[0],
      "language",
      successfulV2Runtime({
        async cleanup() {
          throw new Error("cleanup failed");
        }
      }),
      2
    );
    expect(receipt).toMatchObject({
      classification: "basic-usable",
      errors: [expect.objectContaining({ stage: "cleanup", message: "cleanup failed" })]
    });
    const failureSummary = capabilitySmokeMatrix.capabilitySmokeFailureSummary([receipt]);
    expect(failureSummary).toMatchObject({
      failedCases: 1,
      errorCount: 1,
      cases: [expect.objectContaining({ id: "typescript-exact", paths: ["errors.cleanup"] })]
    });
    expect(capabilitySmokeMatrix.capabilitySmokeExitCode(failureSummary)).toBe(1);

    const unavailableSummary = capabilitySmokeMatrix.capabilitySmokeFailureSummary([{
      id: "broken-runner",
      classification: "unavailable",
      errors: []
    }]);
    expect(unavailableSummary).toMatchObject({
      failedCases: 1,
      cases: [expect.objectContaining({ id: "broken-runner", paths: ["classification.unavailable"] })]
    });
    expect(capabilitySmokeMatrix.capabilitySmokeExitCode(unavailableSummary)).toBe(1);
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
