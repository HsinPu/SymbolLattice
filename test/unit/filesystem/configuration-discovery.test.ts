import { mkdtemp, mkdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { ProjectConfigurationInput } from "../../../src/domain/index-inputs.js";
import { hashSource } from "../../../src/infrastructure/filesystem/discovery.js";
import { discoverConfigurationCandidateInput } from "../../../src/infrastructure/filesystem/configuration-discovery.js";
import {
  nativeProjectFilesystemReader,
  type ProjectFilesystemReader
} from "../../../src/infrastructure/filesystem/project-filesystem.js";

const temporaryDirectories: string[] = [];

async function createProject(): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-config-discovery-"));
  temporaryDirectories.push(projectPath);
  return projectPath;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directoryPath) =>
      rm(directoryPath, { recursive: true, force: true })
    )
  );
});

describe("configuration discovery identity", () => {
  it("hashes known candidates and tracked resolver paths without retaining their contents", async () => {
    const projectPath = await createProject();
    await mkdir(join(projectPath, "packages", "app"), { recursive: true });
    await mkdir(join(projectPath, "configs"), { recursive: true });
    await mkdir(join(projectPath, "node_modules", "ignored"), { recursive: true });
    await writeFile(join(projectPath, "package.json"), "{\"private\":true}\n", "utf8");
    await writeFile(join(projectPath, "packages", "app", "package.json"), "{\"name\":\"app\"}\n", "utf8");
    await writeFile(join(projectPath, "configs", "base.shared.json"), "{\"compilerOptions\":{}}\n", "utf8");
    await writeFile(join(projectPath, "node_modules", "ignored", "package.json"), "{}\n", "utf8");
    const trackedInputs: ProjectConfigurationInput[] = [
      {
        kind: "extends",
        path: "configs/base.shared.json",
        state: "present",
        contentHash: hashSource("{\"compilerOptions\":{}}\n")
      },
      {
        kind: "go-module",
        path: "nested/go.mod",
        state: "absent",
        contentHash: null
      }
    ];

    const input = await discoverConfigurationCandidateInput(projectPath, trackedInputs);

    expect(input).toMatchObject({
      kind: "configuration-discovery",
      path: ".SymbolLattice/configuration-candidates.json",
      state: "present"
    });
    expect(input.contentHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(input).not.toHaveProperty("sourceText");
    expect(input).not.toHaveProperty("absolutePath");
  });

  it("changes when a candidate is added or its same-size same-mtime contents change", async () => {
    const projectPath = await createProject();
    await mkdir(join(projectPath, "packages", "app"), { recursive: true });
    const manifestPath = join(projectPath, "packages", "app", "package.json");
    await writeFile(manifestPath, "{\"name\":\"one\"}\n", "utf8");
    const before = await discoverConfigurationCandidateInput(projectPath, []);
    const metadata = await import("node:fs/promises").then(({ stat }) => stat(manifestPath));
    await writeFile(manifestPath, "{\"name\":\"two\"}\n", "utf8");
    await utimes(manifestPath, metadata.atime, metadata.mtime);

    const changed = await discoverConfigurationCandidateInput(projectPath, []);
    expect(changed.contentHash).not.toBe(before.contentHash);

    await mkdir(join(projectPath, "packages", "worker"), { recursive: true });
    await writeFile(
      join(projectPath, "packages", "worker", "package.json"),
      "{\"name\":\"worker\"}\n",
      "utf8"
    );
    const added = await discoverConfigurationCandidateInput(projectPath, []);
    expect(added.contentHash).not.toBe(changed.contentHash);

    await rm(join(projectPath, "packages", "worker", "package.json"));
    const removed = await discoverConfigurationCandidateInput(projectPath, []);
    expect(removed).toEqual(changed);
  });

  it("tracks nested gitignore contents while excluding default cache candidates", async () => {
    const projectPath = await createProject();
    await mkdir(join(projectPath, "nested"), { recursive: true });
    await mkdir(join(projectPath, ".tmp", "pytest-history"), { recursive: true });
    await writeFile(join(projectPath, "nested", ".gitignore"), "hidden.ts\n", "utf8");

    const before = await discoverConfigurationCandidateInput(projectPath, []);
    await writeFile(join(projectPath, "nested", ".gitignore"), "ignored.ts\n", "utf8");
    const changedIgnore = await discoverConfigurationCandidateInput(projectPath, []);
    expect(changedIgnore.contentHash).not.toBe(before.contentHash);

    await writeFile(
      join(projectPath, ".tmp", "pytest-history", "package.json"),
      "{\"name\":\"ignored\"}\n",
      "utf8"
    );
    const afterDefaultExcludedCandidate = await discoverConfigurationCandidateInput(projectPath, []);
    expect(afterDefaultExcludedCandidate).toEqual(changedIgnore);
  });

  it("reports unreadable configuration candidates with project-relative evidence", async () => {
    const projectPath = await createProject();
    await writeFile(join(projectPath, "package.json"), "{\"private\":true}\n", "utf8");
    const reader: ProjectFilesystemReader = {
      ...nativeProjectFilesystemReader,
      async readFile(filePath) {
        if (filePath.endsWith("package.json")) {
          throw Object.assign(new Error("denied"), { code: "EPERM", path: filePath });
        }
        return nativeProjectFilesystemReader.readFile(filePath);
      }
    };

    await expect(discoverConfigurationCandidateInput(projectPath, [], reader)).rejects.toMatchObject({
      code: "PROJECT_PATH_UNREADABLE",
      evidence: [{ path: "package.json", code: "EPERM" }],
      total: 1,
      truncated: false
    });
  });

  it.each([
    ["crates/new/Cargo.toml", "[package]\nname = \"new\"\nversion = \"0.1.0\"\n"],
    ["services/api/go.mod", "module example.test/api\n\ngo 1.24\n"],
    ["modules/api/pom.xml", "<project />\n"],
    ["modules/api/build.gradle.kts", "plugins { java }\n"],
    ["Apple/App.xcodeproj/project.pbxproj", "// !$*UTF8*$!\n{}\n"]
  ])("detects a newly added Cargo, Go, JVM, or Xcode candidate at %s", async (path, contents) => {
    const projectPath = await createProject();
    const before = await discoverConfigurationCandidateInput(projectPath, []);
    const segments = path.split("/");
    await mkdir(join(projectPath, ...segments.slice(0, -1)), { recursive: true });
    await writeFile(join(projectPath, ...segments), contents, "utf8");

    const after = await discoverConfigurationCandidateInput(projectPath, []);

    expect(after.contentHash).not.toBe(before.contentHash);
  });

  it("ignores hard-excluded candidates and is independent of tracked-input order", async () => {
    const projectPath = await createProject();
    await mkdir(join(projectPath, "node_modules", "hidden"), { recursive: true });
    const trackedInputs: ProjectConfigurationInput[] = [
      { kind: "tsconfig", path: "tsconfig.json", state: "absent", contentHash: null },
      { kind: "jsconfig", path: "jsconfig.json", state: "absent", contentHash: null },
      {
        kind: "cargo-workspace-member-glob",
        path: ".SymbolLattice/cargo-workspace-members.json",
        state: "present",
        contentHash: hashSource("virtual")
      }
    ];
    const before = await discoverConfigurationCandidateInput(projectPath, trackedInputs);
    const reversed = await discoverConfigurationCandidateInput(projectPath, [...trackedInputs].reverse());
    await writeFile(
      join(projectPath, "node_modules", "hidden", "package.json"),
      "{\"name\":\"ignored\"}\n",
      "utf8"
    );
    const afterExcludedChange = await discoverConfigurationCandidateInput(projectPath, trackedInputs);

    expect(reversed).toEqual(before);
    expect(afterExcludedChange).toEqual(before);
  });
});
