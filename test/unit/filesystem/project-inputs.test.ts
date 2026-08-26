import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { hashSource } from "../../../src/infrastructure/filesystem/discovery.js";
import {
  buildProjectIndexInputs,
  canonicalizeConfigurationInputs,
  readProjectConfigurationInput
} from "../../../src/infrastructure/filesystem/project-inputs.js";
import {
  nativeProjectFilesystemReader,
  type ProjectFilesystemReader
} from "../../../src/infrastructure/filesystem/project-filesystem.js";

const temporaryDirectories: string[] = [];

async function createProject(): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-inputs-"));
  temporaryDirectories.push(projectPath);
  return projectPath;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directoryPath) => {
      const { rm } = await import("node:fs/promises");
      await rm(directoryPath, { recursive: true, force: true });
    })
  );
});

describe("project index inputs", () => {
  it("captures root gitignore state, canonical scope roots, and a deterministic composed fingerprint", async () => {
    const projectPath = await createProject();
    await mkdir(join(projectPath, "src"), { recursive: true });
    await mkdir(join(projectPath, "configs"), { recursive: true });
    await writeFile(join(projectPath, ".gitignore"), "generated/\n", "utf8");

    const additionalInputs = [
      {
        kind: "extends" as const,
        path: "configs\\base.json",
        state: "present" as const,
        contentHash: "base-hash"
      },
      {
        kind: "tsconfig" as const,
        path: "tsconfig.json",
        state: "present" as const,
        contentHash: "tsconfig-hash"
      },
      {
        kind: "extends" as const,
        path: "configs/base.json",
        state: "present" as const,
        contentHash: "base-hash"
      }
    ];

    const first = await buildProjectIndexInputs(projectPath, {
      scopeRoots: ["src", "src"],
      additionalConfigurationInputs: additionalInputs
    });
    const second = await buildProjectIndexInputs(projectPath, {
      scopeRoots: ["src"],
      additionalConfigurationInputs: [...additionalInputs].reverse()
    });

    expect(first.scopeRoots).toEqual(["src"]);
    expect(first.formatVersion).toBe("project-inputs-v11");
    expect(first.configurationInputs).toEqual([
      {
        kind: "root-gitignore",
        path: ".gitignore",
        state: "present",
        contentHash: hashSource("generated/\n")
      },
      {
        kind: "tsconfig",
        path: "tsconfig.json",
        state: "present",
        contentHash: "tsconfig-hash"
      },
      {
        kind: "extends",
        path: "configs/base.json",
        state: "present",
        contentHash: "base-hash"
      },
      {
        kind: "configuration-discovery",
        path: ".SymbolLattice/configuration-candidates.json",
        state: "present",
        contentHash: expect.stringMatching(/^[a-f0-9]{64}$/u)
      }
    ]);
    expect(second).toEqual(first);
  });

  it("represents missing configuration files explicitly and rejects conflicting records", async () => {
    const projectPath = await createProject();

    await expect(buildProjectIndexInputs(projectPath)).resolves.toMatchObject({
      scopeRoots: ["."],
      configurationInputs: [
        {
          kind: "root-gitignore",
          path: ".gitignore",
          state: "absent",
          contentHash: null
        },
        {
          kind: "configuration-discovery",
          path: ".SymbolLattice/configuration-candidates.json",
          state: "present",
          contentHash: expect.stringMatching(/^[a-f0-9]{64}$/u)
        }
      ]
    });

    await expect(
      readProjectConfigurationInput(projectPath, "tsconfig", "tsconfig.json")
    ).resolves.toEqual({
      kind: "tsconfig",
      path: "tsconfig.json",
      state: "absent",
      contentHash: null
    });
    expect(() =>
      canonicalizeConfigurationInputs([
        {
          kind: "tsconfig",
          path: "tsconfig.json",
          state: "present",
          contentHash: "first"
        },
        {
          kind: "tsconfig",
          path: "tsconfig.json",
          state: "present",
          contentHash: "second"
        }
      ])
    ).toThrow("Conflicting configuration inputs");
  });

  it("normalizes unreadable configuration files and treats ENOTDIR as a scan race", async () => {
    const projectPath = await createProject();
    const unreadable: ProjectFilesystemReader = {
      ...nativeProjectFilesystemReader,
      async readFile(filePath) {
        throw Object.assign(new Error("denied"), { code: "EACCES", path: filePath });
      }
    };
    await expect(
      readProjectConfigurationInput(projectPath, "tsconfig", "tsconfig.json", unreadable)
    ).rejects.toMatchObject({
      code: "PROJECT_PATH_UNREADABLE",
      evidence: [{ path: "tsconfig.json", code: "EACCES" }]
    });

    const vanished: ProjectFilesystemReader = {
      ...nativeProjectFilesystemReader,
      async readFile(filePath) {
        throw Object.assign(new Error("not a directory"), { code: "ENOTDIR", path: filePath });
      }
    };
    await expect(
      readProjectConfigurationInput(projectPath, "tsconfig", "nested/tsconfig.json", vanished)
    ).resolves.toMatchObject({ state: "absent", contentHash: null });
  });
});
