import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";

const temporaryProjectPaths: string[] = [];

async function createProject(files: Readonly<Record<string, string>>): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), "symbol-lattice-jvm-project-"));
  temporaryProjectPaths.push(projectPath);
  await Promise.all(
    Object.entries(files).map(async ([relativePath, sourceText]) => {
      const absolutePath = resolve(projectPath, ...relativePath.split("/"));
      await mkdir(resolve(absolutePath, ".."), { recursive: true });
      await writeFile(absolutePath, sourceText, "utf8");
    })
  );
  return projectPath;
}

afterEach(async () => {
  await Promise.all(
    temporaryProjectPaths.splice(0).map((projectPath) => rm(projectPath, { recursive: true, force: true }))
  );
});

describe("JVM project module evidence", () => {
  it("tracks nested conventional Maven modules and their Java/Kotlin source sets", async () => {
    const projectPath = await createProject({
      "pom.xml": [
        "<project>",
        "  <modules><module>platform</module></modules>",
        "</project>"
      ].join("\n"),
      "platform/pom.xml": [
        "<project>",
        "  <!-- ignored: <module>not-a-module</module> -->",
        "  <modules><module>api</module></modules>",
        "</project>"
      ].join("\n"),
      "platform/api/pom.xml": "<project />\n",
      "platform/api/src/main/java/example/Contract.java": "package example; interface Contract {}\n",
      "platform/api/src/test/kotlin/example/ContractTest.kt": "package example\nclass ContractTest\n"
    });

    const scan = await new FileSystemSourceCatalog().scan(projectPath);

    expect(scan.indexInputs.configurationInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "maven-project", path: "pom.xml", state: "present" }),
        expect.objectContaining({ kind: "maven-project", path: "platform/pom.xml", state: "present" }),
        expect.objectContaining({ kind: "maven-project", path: "platform/api/pom.xml", state: "present" })
      ])
    );
    expect(scan.jvmProjectModuleEvidence).toEqual({
      memberships: [
        {
          filePath: "platform/api/src/main/java/example/Contract.java",
          moduleId: "maven:platform/api/pom.xml",
          sourceSet: "main",
          configurationPaths: ["platform/api/pom.xml", "platform/pom.xml", "pom.xml"]
        },
        {
          filePath: "platform/api/src/test/kotlin/example/ContractTest.kt",
          moduleId: "maven:platform/api/pom.xml",
          sourceSet: "test",
          configurationPaths: ["platform/api/pom.xml", "platform/pom.xml", "pom.xml"]
        }
      ]
    });
  });

  it("tracks literal Gradle includes and conventional module source roots", async () => {
    const projectPath = await createProject({
      "settings.gradle.kts": ['include(":api")', 'include("app")'].join("\n"),
      "api/build.gradle.kts": "plugins {}\n",
      "app/build.gradle": "plugins {}\n",
      "api/src/main/java/example/Contract.java": "package example; interface Contract {}\n",
      "api/src/test/kotlin/example/ContractTest.kt": "package example\nclass ContractTest\n",
      "app/src/main/kotlin/example/Consumer.kt": "package example\nclass Consumer\n"
    });

    const scan = await new FileSystemSourceCatalog().scan(projectPath);

    expect(scan.indexInputs.configurationInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "gradle-settings", path: "settings.gradle.kts", state: "present" }),
        expect.objectContaining({ kind: "gradle-build", path: "api/build.gradle.kts", state: "present" }),
        expect.objectContaining({ kind: "gradle-build", path: "app/build.gradle", state: "present" })
      ])
    );
    expect(scan.jvmProjectModuleEvidence).toEqual({
      memberships: [
        {
          filePath: "api/src/main/java/example/Contract.java",
          moduleId: "gradle:api/build.gradle.kts",
          sourceSet: "main",
          configurationPaths: ["api/build.gradle.kts", "settings.gradle.kts"]
        },
        {
          filePath: "api/src/test/kotlin/example/ContractTest.kt",
          moduleId: "gradle:api/build.gradle.kts",
          sourceSet: "test",
          configurationPaths: ["api/build.gradle.kts", "settings.gradle.kts"]
        },
        {
          filePath: "app/src/main/kotlin/example/Consumer.kt",
          moduleId: "gradle:app/build.gradle",
          sourceSet: "main",
          configurationPaths: ["app/build.gradle", "settings.gradle.kts"]
        }
      ]
    });
  });

  it("does not guess a Gradle projectDir mapping or access an unsafe module directory", async () => {
    const projectPath = await createProject({
      "settings.gradle": [
        "include ':api', ':..'",
        "project(':api').projectDir = file('custom-api')"
      ].join("\n"),
      "custom-api/build.gradle": "plugins {}\n",
      "custom-api/src/main/java/example/Contract.java": "package example; interface Contract {}\n"
    });

    const scan = await new FileSystemSourceCatalog().scan(projectPath);

    expect(scan.jvmProjectModuleEvidence).toEqual({ memberships: [] });
    expect(scan.indexInputs.configurationInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "gradle-build", path: "api/build.gradle", state: "absent" }),
        expect.objectContaining({ kind: "gradle-build", path: "api/build.gradle.kts", state: "absent" })
      ])
    );
  });
});
