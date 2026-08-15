import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";

const temporaryProjectPaths: string[] = [];

async function createProject(files: Readonly<Record<string, string>>): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), "SymbolLattice-jvm-project-"));
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
      ],
      dependencies: []
    });
  });

  it("tracks direct local Maven module dependencies by literal coordinates and scope", async () => {
    const projectPath = await createProject({
      "pom.xml": [
        "<project>",
        "  <groupId>example</groupId>",
        "  <artifactId>root</artifactId>",
        "  <modules><module>api</module><module>app</module><module>provided-api</module><module>runtime-api</module></modules>",
        "  <dependencyManagement><dependencies>",
        "    <dependency><groupId>example</groupId><artifactId>api</artifactId></dependency>",
        "  </dependencies></dependencyManagement>",
        "</project>"
      ].join("\n"),
      "api/pom.xml": [
        "<project>",
        "  <parent><groupId>example</groupId><artifactId>root</artifactId></parent>",
        "  <artifactId>api</artifactId>",
        "</project>"
      ].join("\n"),
      "provided-api/pom.xml": [
        "<project>",
        "  <parent><groupId>example</groupId><artifactId>root</artifactId></parent>",
        "  <artifactId>provided-api</artifactId>",
        "</project>"
      ].join("\n"),
      "runtime-api/pom.xml": [
        "<project>",
        "  <parent><groupId>example</groupId><artifactId>root</artifactId></parent>",
        "  <artifactId>runtime-api</artifactId>",
        "</project>"
      ].join("\n"),
      "app/pom.xml": [
        "<project>",
        "  <parent><groupId>example</groupId><artifactId>root</artifactId></parent>",
        "  <artifactId>app</artifactId>",
        "  <dependencies>",
        "    <dependency><groupId>example</groupId><artifactId>api</artifactId></dependency>",
        "    <dependency><groupId>example</groupId><artifactId>api</artifactId><scope>test</scope></dependency>",
        "    <dependency><groupId>example</groupId><artifactId>provided-api</artifactId><scope>provided</scope></dependency>",
        "    <dependency><groupId>example</groupId><artifactId>runtime-api</artifactId><scope>runtime</scope></dependency>",
        "  </dependencies>",
        "</project>"
      ].join("\n"),
      "api/src/main/java/example/Contract.java": "package example; interface Contract {}\n",
      "app/src/main/java/example/Consumer.java": "package example; class Consumer {}\n",
      "app/src/test/java/example/ConsumerTest.java": "package example; class ConsumerTest {}\n"
    });

    const scan = await new FileSystemSourceCatalog().scan(projectPath);

    expect(scan.jvmProjectModuleEvidence?.dependencies).toEqual([
      {
        sourceModuleId: "maven:app/pom.xml",
        targetModuleId: "maven:api/pom.xml",
        consumerSourceSet: "main",
        kind: "maven-module",
        configurationPaths: ["api/pom.xml", "app/pom.xml", "pom.xml"]
      },
      {
        sourceModuleId: "maven:app/pom.xml",
        targetModuleId: "maven:api/pom.xml",
        consumerSourceSet: "test",
        kind: "maven-module",
        configurationPaths: ["api/pom.xml", "app/pom.xml", "pom.xml"]
      },
      {
        sourceModuleId: "maven:app/pom.xml",
        targetModuleId: "maven:provided-api/pom.xml",
        consumerSourceSet: "main",
        kind: "maven-module",
        configurationPaths: ["app/pom.xml", "pom.xml", "provided-api/pom.xml"]
      }
    ]);
  });

  it("tracks literal Gradle includes and conventional module source roots", async () => {
    const projectPath = await createProject({
      "settings.gradle.kts": ['include(":api")', 'include("app")'].join("\n"),
      "api/build.gradle.kts": "plugins {}\n",
      "app/build.gradle": [
        "plugins {}",
        "dependencies {",
        "  implementation project(':api')",
        "  testImplementation(project(\"api\"))",
        "  runtimeOnly(project(':api'))",
        "}"
      ].join("\n"),
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
      ],
      dependencies: [
        {
          sourceModuleId: "gradle:app/build.gradle",
          targetModuleId: "gradle:api/build.gradle.kts",
          consumerSourceSet: "main",
          kind: "gradle-project",
          configurationPaths: ["api/build.gradle.kts", "app/build.gradle", "settings.gradle.kts"]
        },
        {
          sourceModuleId: "gradle:app/build.gradle",
          targetModuleId: "gradle:api/build.gradle.kts",
          consumerSourceSet: "test",
          kind: "gradle-project",
          configurationPaths: ["api/build.gradle.kts", "app/build.gradle", "settings.gradle.kts"]
        }
      ]
    });
  });

  it("ignores Gradle include and dependency text inside multiline strings", async () => {
    const projectPath = await createProject({
      "settings.gradle.kts": [
        'val ignored = """',
        'include(":phantom")',
        '"""',
        'include(":api", ":app")'
      ].join("\n"),
      "api/build.gradle.kts": "plugins {}\n",
      "app/build.gradle.kts": [
        "plugins {}",
        'val ignored = """',
        "dependencies {",
        '  implementation(project(":phantom"))',
        "}",
        '"""',
        "dependencies {",
        '  implementation(project(":api"))',
        "}"
      ].join("\n"),
      "phantom/build.gradle.kts": "plugins {}\n",
      "api/src/main/java/example/Contract.java": "package example; interface Contract {}\n",
      "app/src/main/java/example/Consumer.java": "package example; class Consumer {}\n"
    });

    const scan = await new FileSystemSourceCatalog().scan(projectPath);

    expect(scan.jvmProjectModuleEvidence?.dependencies).toEqual([
      {
        sourceModuleId: "gradle:app/build.gradle.kts",
        targetModuleId: "gradle:api/build.gradle.kts",
        consumerSourceSet: "main",
        kind: "gradle-project",
        configurationPaths: ["api/build.gradle.kts", "app/build.gradle.kts", "settings.gradle.kts"]
      }
    ]);
    expect(scan.indexInputs.configurationInputs).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "gradle-build", path: "phantom/build.gradle.kts" })
      ])
    );
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

    expect(scan.jvmProjectModuleEvidence).toEqual({ memberships: [], dependencies: [] });
    expect(scan.indexInputs.configurationInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "gradle-build", path: "api/build.gradle", state: "absent" }),
        expect.objectContaining({ kind: "gradle-build", path: "api/build.gradle.kts", state: "absent" })
      ])
    );
  });
});
