import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { resolveProjectFacts } from "../../../src/application/resolution.js";
import { extractFileFacts } from "../../../src/extraction/index.js";
import type {
  JvmProjectModuleEvidence,
  SourceDocument
} from "../../../src/ports/source-catalog.js";

const INDEXED_AT = "2026-09-09T00:00:00.000Z";

type JvmFixtureFiles = Readonly<Record<string, string>>;

function sourceDocuments(files: JvmFixtureFiles): readonly SourceDocument[] {
  return Object.entries(files).map(([relativePath, sourceText]) => ({
    relativePath,
    absolutePath: `/jvm-resolver-parity/${relativePath}`,
    language: relativePath.endsWith(".kt") ? "kotlin" : "java",
    sourceText,
    contentHash: createHash("sha256").update(sourceText).digest("hex")
  }));
}

function resolveFixture(
  files: JvmFixtureFiles,
  jvmProjectModuleEvidence?: JvmProjectModuleEvidence
) {
  const documents = sourceDocuments(files);
  return resolveProjectFacts({
    sourceDocuments: documents,
    extractedFiles: documents.map((document) => extractFileFacts({
      filePath: document.relativePath,
      sourceText: document.sourceText,
      language: document.language
    })),
    indexedAt: INDEXED_AT,
    ...(jvmProjectModuleEvidence === undefined ? {} : { jvmProjectModuleEvidence })
  });
}

function jvmProjectEdges(result: ReturnType<typeof resolveProjectFacts>) {
  return result.edges.filter((edge) =>
    edge.evidence?.ruleId.startsWith("module.java.") ||
    edge.evidence?.ruleId.startsWith("syntax.jvm.cross-file.")
  );
}

function moduleEvidence(files: readonly string[]): JvmProjectModuleEvidence {
  const apiFiles = files.filter((filePath) => filePath.startsWith("src/api/") || filePath.startsWith("src/kotlin/api/"));
  const appFiles = files.filter((filePath) => !apiFiles.includes(filePath));
  const apiConfigurationPaths = ["api/pom.xml", "pom.xml"];
  const appConfigurationPaths = ["app/pom.xml", "pom.xml"];
  return {
    memberships: [
      ...apiFiles.map((filePath) => ({
        filePath,
        moduleId: "maven:api/pom.xml",
        sourceSet: "main" as const,
        configurationPaths: apiConfigurationPaths
      })),
      ...appFiles.map((filePath) => ({
        filePath,
        moduleId: "maven:app/pom.xml",
        sourceSet: "main" as const,
        configurationPaths: appConfigurationPaths
      }))
    ],
    dependencies: [{
      sourceModuleId: "maven:app/pom.xml",
      targetModuleId: "maven:api/pom.xml",
      consumerSourceSet: "main",
      kind: "maven-module" as const,
      configurationPaths: ["api/pom.xml", "app/pom.xml", "pom.xml"]
    }]
  };
}

const POSITIVE_FILES = {
  "src/api/Marker.java": [
    "package api;",
    "public @interface Marker {}"
  ].join("\n"),
  "src/api/Base.java": [
    "package api;",
    "public class Base {}"
  ].join("\n"),
  "src/api/Contract.java": [
    "package api;",
    "public interface Contract {}"
  ].join("\n"),
  "src/app/LocalBase.java": [
    "package app;",
    "public class LocalBase {}"
  ].join("\n"),
  "src/app/LocalTag.java": [
    "package app;",
    "public @interface LocalTag {}"
  ].join("\n"),
  "src/app/Consumer.java": [
    "package app;",
    "import api.Marker;",
    "import api.Base;",
    "import api.Contract;",
    "@Marker",
    "public class Consumer extends Base implements Contract {",
    "  @LocalTag void run() {}",
    "}"
  ].join("\n"),
  "src/app/LocalChild.java": [
    "package app;",
    "public class LocalChild extends LocalBase {}"
  ].join("\n"),
  "src/app/LocalInterfaceChild.java": [
    "package app;",
    "public interface LocalInterfaceChild extends LocalTag {}"
  ].join("\n"),
  "src/kotlin/api/KotlinContract.kt": [
    "package api",
    "interface KotlinContract"
  ].join("\n"),
  "src/kotlin/app/KotlinChild.kt": [
    "package app",
    "import api.KotlinContract",
    "class KotlinChild : KotlinContract"
  ].join("\n")
} as const;

describe("JVM resolver module-move parity golden", () => {
  it("preserves complete Java/Kotlin import, annotation, heritage and evidence output", () => {
    const result = resolveFixture(
      POSITIVE_FILES,
      moduleEvidence(Object.keys(POSITIVE_FILES))
    );
    const projectEdges = jvmProjectEdges(result);

    expect(projectEdges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "imports",
        resolution: "exact",
        evidence: expect.objectContaining({
          ruleId: "module.java.explicit-import.project-type",
          stage: "module"
        })
      }),
      expect.objectContaining({
        kind: "references",
        resolution: "exact",
        evidence: expect.objectContaining({
          ruleId: "module.java.annotation-type.explicit-import.project-type",
          stage: "module"
        })
      }),
      expect.objectContaining({
        kind: "extends",
        resolution: "exact",
        evidence: expect.objectContaining({
          ruleId: "syntax.jvm.cross-file.explicit-import.declared-maven-module.direct-superclass",
          stage: "module"
        })
      }),
      expect.objectContaining({
        kind: "implements",
        resolution: "exact",
        evidence: expect.objectContaining({
          ruleId: "syntax.jvm.cross-file.explicit-import.declared-maven-module.direct-implements",
          stage: "module"
        })
      }),
      expect.objectContaining({
        kind: "extends",
        resolution: "exact",
        evidence: expect.objectContaining({
          ruleId: "syntax.jvm.cross-file.same-package.direct-superclass",
          stage: "module"
        })
      })
    ]));
    expect(projectEdges.some((edge) => edge.evidence?.ruleId === "syntax.jvm.cross-file.explicit-import.declared-maven-module.direct-implements" && edge.filePath === "src/kotlin/app/KotlinChild.kt")).toBe(true);
    expect(result).toMatchSnapshot();
  });

  it("preserves duplicate, wildcard, missing and nested-type nonclaims", () => {
    const result = resolveFixture({
      "src/api/Contract.java": "package api; public interface Contract {}",
      "src/duplicate/Contract.java": "package api; public interface Contract {}",
      "src/app/WildcardChild.java": [
        "package app;",
        "import api.*;",
        "public class WildcardChild implements Contract {}"
      ].join("\n"),
      "src/app/MissingChild.java": "package app; public class MissingChild extends missing.Base {}",
      "src/app/NestedChild.java": "package app; public class NestedChild implements api.Outer.Contract {}"
    });
    expect(jvmProjectEdges(result)).toEqual([]);
    expect(result).toMatchSnapshot();
  });
});
