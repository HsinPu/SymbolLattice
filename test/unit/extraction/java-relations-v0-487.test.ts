import { describe, expect, it } from "vitest";

import { extractFileFacts } from "../../../src/extraction/index.js";

describe("Java relation depth v0.487", () => {
  it("retains direct object creation from a clean modern parser when legacy recovery is noisy", () => {
    const facts = extractFileFacts({
      filePath: "src/app/Runner.java",
      language: "java",
      sourceText: [
        "package app;",
        "class Runner {",
        "  void run(Object value) {",
        "    Service<String> created = new Service<>();",
        "    if (value instanceof String text) { System.out.println(text); }",
        "  }",
        "}"
      ].join("\n")
    });

    expect(facts.jvmFacts?.javaInstantiationReferences).toEqual([
      expect.objectContaining({
        sourceId: expect.stringContaining("Runner.run"),
        referenceName: "Service",
        range: {
          start: { line: 4, column: 35 },
          end: { line: 4, column: 42 }
        }
      })
    ]);
  });

  it("does not attribute object creation inside a lambda to the enclosing method", () => {
    const facts = extractFileFacts({
      filePath: "src/app/Runner.java",
      language: "java",
      sourceText: [
        "package app;",
        "class Runner {",
        "  void run() {",
        "    new Service<>();",
        "    Runnable task = () -> { new Service<>(); };",
        "  }",
        "}"
      ].join("\n")
    });

    expect(
      facts.jvmFacts?.javaInstantiationReferences.filter((reference) => reference.referenceName === "Service")
    ).toHaveLength(1);
  });

  it("keeps malformed modern source without object-creation facts", () => {
    const facts = extractFileFacts({
      filePath: "src/app/Broken.java",
      language: "java",
      sourceText: "package app; class Broken { void run() { new Service<>();"
    });

    expect(facts.jvmFacts?.javaInstantiationReferences).toEqual([]);
  });
});
