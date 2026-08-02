import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { FileSystemSourceCatalog } from "../../../src/infrastructure/filesystem/index.js";

const temporaryProjectPaths: string[] = [];

async function createProject(files: Readonly<Record<string, string>>): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), "symbol-lattice-xcode-project-"));
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

function nativeTargetProject(options: { readonly extensionInSources?: boolean } = {}): string {
  const extensionBuildFileLines = options.extensionInSources === false ? [] : ["        BUILD_EXT,"];
  return [
    "// !$*UTF8*$!",
    "{",
    "  archiveVersion = 1;",
    "  objects = {",
    "    APP /* Calendar App */ = {",
    "      isa = PBXNativeTarget;",
    "      buildPhases = (",
    "        SOURCES /* Sources */,",
    "      );",
    "      name = \"Calendar App\";",
    "    };",
    "    SOURCES = {",
    "      isa = PBXSourcesBuildPhase;",
    "      files = (",
    "        BUILD_EXPORT /* Objective-C bridge */,",
    "        BUILD_MODULE /* Swift type */,",
    ...extensionBuildFileLines,
    "      );",
    "    };",
    "    BUILD_EXPORT = { isa = PBXBuildFile; fileRef = EXPORT; };",
    "    BUILD_MODULE = { isa = PBXBuildFile; fileRef = MODULE; };",
    "    BUILD_EXT = { isa = PBXBuildFile; fileRef = EXT; };",
    "    ROOT = {",
    "      isa = PBXGroup;",
    "      children = (",
    "        EXPORT,",
    "        MODULE,",
    "        EXT,",
    "      );",
    "      sourceTree = \"<group>\";",
    "    };",
    "    EXPORT = {",
    "      isa = PBXFileReference;",
    "      path = CalendarModuleExport.m;",
    "      sourceTree = \"<group>\";",
    "    };",
    "    MODULE = {",
    "      isa = PBXFileReference;",
    "      path = CalendarModule.swift;",
    "      sourceTree = \"<group>\";",
    "    };",
    "    EXT = {",
    "      isa = PBXFileReference;",
    "      path = CalendarModule+Extras.swift;",
    "      sourceTree = \"<group>\";",
    "    };",
    "    PROJECT = { isa = PBXProject; mainGroup = ROOT; };",
    "  };",
    "  rootObject = PROJECT;",
    "}"
  ].join("\n");
}

afterEach(async () => {
  await Promise.all(
    temporaryProjectPaths.splice(0).map((projectPath) => rm(projectPath, { recursive: true, force: true }))
  );
});

describe("Xcode project evidence", () => {
  it("tracks one native target's Objective-C and Swift source membership", async () => {
    const projectPath = await createProject({
      "ios/CalendarModuleExport.m": "void bridge(void) {}\n",
      "ios/CalendarModule.swift": "final class CalendarModule {}\n",
      "ios/CalendarModule+Extras.swift": "extension CalendarModule {}\n",
      "ios/Calendar App.xcodeproj/project.pbxproj": nativeTargetProject()
    });

    const scan = await new FileSystemSourceCatalog().scan(projectPath);

    expect(scan.indexInputs.configurationInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "xcode-project",
          path: "ios/Calendar App.xcodeproj/project.pbxproj",
          state: "present"
        })
      ])
    );
    expect(scan.xcodeTargetMemberships).toEqual([
      {
        filePath: "ios/CalendarModule+Extras.swift",
        targetId: "ios/Calendar App.xcodeproj/project.pbxproj#APP",
        configurationPath: "ios/Calendar App.xcodeproj/project.pbxproj"
      },
      {
        filePath: "ios/CalendarModule.swift",
        targetId: "ios/Calendar App.xcodeproj/project.pbxproj#APP",
        configurationPath: "ios/Calendar App.xcodeproj/project.pbxproj"
      },
      {
        filePath: "ios/CalendarModuleExport.m",
        targetId: "ios/Calendar App.xcodeproj/project.pbxproj#APP",
        configurationPath: "ios/Calendar App.xcodeproj/project.pbxproj"
      }
    ]);
  });

  it("fails closed for malformed project syntax and source paths outside the project", async () => {
    const malformedProject = await createProject({
      "ios/CalendarModule.swift": "final class CalendarModule {}\n",
      "ios/App.xcodeproj/project.pbxproj": "{ objects = {"
    });
    const traversalProject = await createProject({
      "ios/CalendarModule.swift": "final class CalendarModule {}\n",
      "ios/App.xcodeproj/project.pbxproj": [
        "{",
        "  objects = {",
        "    APP = { isa = PBXNativeTarget; buildPhases = ( SOURCES, ); };",
        "    SOURCES = { isa = PBXSourcesBuildPhase; files = ( BUILD, ); };",
        "    BUILD = { isa = PBXBuildFile; fileRef = MODULE; };",
        "    ROOT = { isa = PBXGroup; children = ( MODULE, ); sourceTree = \"<group>\"; };",
        "    MODULE = { isa = PBXFileReference; path = ../../CalendarModule.swift; sourceTree = \"<group>\"; };",
        "    PROJECT = { isa = PBXProject; mainGroup = ROOT; };",
        "  };",
        "  rootObject = PROJECT;",
        "}"
      ].join("\n")
    });

    await expect(new FileSystemSourceCatalog().scan(malformedProject)).resolves.toMatchObject({
      xcodeTargetMemberships: []
    });
    await expect(new FileSystemSourceCatalog().scan(traversalProject)).resolves.toMatchObject({
      xcodeTargetMemberships: []
    });
  });
});
